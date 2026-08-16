/**
 * Fail-closed environment guard for the upgrade rehearsal.
 *
 * The rehearsal installs a real NSIS package, launches it, lets the real
 * electron-updater replace it, and migrates whatever database the installed
 * application opens. On a developer's or a shop's machine that is destructive:
 * it would install over their application and migrate their live data file.
 *
 * So the rehearsal does not run unless it can positively identify a throwaway
 * machine. Absence of evidence is treated as evidence of a real machine —
 * every unknown answer refuses.
 *
 * Two independent things must both hold:
 *
 *   1. The operator explicitly marked the machine disposable, by exporting
 *      RENTAL_UPGRADE_REHEARSAL_DISPOSABLE with the exact opt-in value below.
 *      A typo, an empty value or a plain "1" is not consent.
 *   2. The machine independently looks disposable: a GitHub-hosted Windows
 *      runner, a Windows Sandbox session, or a VM the operator has stamped
 *      with the marker file. An environment variable alone can be exported by
 *      accident in a normal shell; these cannot.
 *
 * On top of that, three filesystem checks refuse outright when the product is
 * already present on the machine. Those paths belong to a real installation,
 * and their mere existence means this is somebody's working computer. The
 * guard only ever asks whether they exist. It never opens, reads, copies or
 * removes anything inside them.
 */
import fs from "node:fs";
import path from "node:path";

/** The exact opt-in. Deliberately awkward to type by accident. */
export const disposableMarker = Object.freeze({
  name: "RENTAL_UPGRADE_REHEARSAL_DISPOSABLE",
  value: "yes-this-machine-is-disposable",
});

/**
 * A file the operator drops on a throwaway VM's system drive. It corroborates
 * the environment variable for VMs, which have no other reliable tell.
 */
export const disposableMarkerFileName = "disposable-rehearsal-vm.txt";

/** Electron resolves userData from productName, not the package name. */
export const productUserDataDirectoryName = "ARAK Rental Desk";

/** electron-updater's download cache is keyed on the package name. */
export const updaterCacheDirectoryName = "arak-rental-desk-updater";

/** Where the per-user NSIS package installs itself. */
export const installedProgramDirectoryName = "arak-rental-desk";

/**
 * The pure decision. Everything it needs is in `probe`, so the rules can be
 * tested against machines that do not exist here.
 *
 * @returns {{allowed: boolean, refusals: string[], signals: string[]}}
 */
export function decideEnvironment(probe) {
  const refusals = [];
  const signals = [];

  if (probe.platform !== "win32") {
    refusals.push(
      `the rehearsal drives a Windows NSIS installer, and this is ${probe.platform}`,
    );
  }

  if (probe.markerValue !== disposableMarker.value) {
    refusals.push(
      probe.markerValue === undefined || probe.markerValue === ""
        ? `${disposableMarker.name} is not set`
        : `${disposableMarker.name} is set to something other than the opt-in value`,
    );
  }

  if (probe.isGithubHostedRunner) {
    signals.push("GitHub-hosted runner");
  }

  if (probe.isWindowsSandbox) {
    signals.push("Windows Sandbox session");
  }

  if (probe.hasDisposableMarkerFile) {
    signals.push(`marker file ${disposableMarkerFileName}`);
  }

  if (signals.length === 0) {
    refusals.push(
      "nothing about this machine says it is disposable: no GitHub-hosted " +
        `runner, no Windows Sandbox, no ${disposableMarkerFileName} marker file`,
    );
  }

  // The product being present at all means somebody uses this machine.
  if (probe.hasProductUserData) {
    refusals.push(
      `a real data directory already exists at ${probe.productUserDataPath}`,
    );
  }

  if (probe.hasInstalledProgram) {
    refusals.push(
      `the application is already installed at ${probe.installedProgramPath}`,
    );
  }

  if (probe.hasUpdaterCache) {
    refusals.push(
      `an electron-updater cache already exists at ${probe.updaterCachePath}`,
    );
  }

  return { allowed: refusals.length === 0, refusals, signals };
}

/** Reads the machine. Existence checks only; nothing is opened. */
export function probeEnvironment(env = process.env, platform = process.platform) {
  const appData = env.APPDATA ?? "";
  const localAppData = env.LOCALAPPDATA ?? "";
  const systemDrive = env.SystemDrive ?? "C:";

  const productUserDataPath = appData
    ? path.join(appData, productUserDataDirectoryName)
    : "";
  const installedProgramPath = localAppData
    ? path.join(localAppData, "Programs", installedProgramDirectoryName)
    : "";
  const updaterCachePath = localAppData
    ? path.join(localAppData, updaterCacheDirectoryName)
    : "";
  const markerFilePath = path.join(`${systemDrive}\\`, disposableMarkerFileName);

  return {
    platform,
    markerValue: env[disposableMarker.name],
    isGithubHostedRunner:
      env.GITHUB_ACTIONS === "true" &&
      env.CI === "true" &&
      Boolean(env.RUNNER_TEMP),
    // Windows Sandbox always runs as this fixed account.
    isWindowsSandbox: env.USERNAME === "WDAGUtilityAccount",
    hasDisposableMarkerFile: exists(markerFilePath),
    markerFilePath,
    productUserDataPath,
    hasProductUserData: Boolean(productUserDataPath) && exists(productUserDataPath),
    installedProgramPath,
    hasInstalledProgram: Boolean(installedProgramPath) && exists(installedProgramPath),
    updaterCachePath,
    hasUpdaterCache: Boolean(updaterCachePath) && exists(updaterCachePath),
  };
}

/**
 * The call sites use this: it either returns the probe or throws with every
 * reason listed, so an operator sees all of what to fix rather than one at a
 * time.
 */
export function assertDisposableEnvironment(probe = probeEnvironment()) {
  const decision = decideEnvironment(probe);

  if (decision.allowed) {
    return { probe, decision };
  }

  const detail = decision.refusals.map((reason) => `  - ${reason}`).join("\n");

  throw new Error(
    "Refusing to run the upgrade rehearsal: this does not look like a " +
      "disposable machine.\n\n" +
      `${detail}\n\n` +
      "This test installs a real package, replaces it through the real " +
      "updater, and migrates whatever database the installed application " +
      "opens. Run it only in a disposable Windows VM, Windows Sandbox, or a " +
      "fresh CI runner.\n\n" +
      `To opt in on a machine you are willing to destroy, set ${disposableMarker.name}=${disposableMarker.value} ` +
      `and drop an empty ${disposableMarkerFileName} on the system drive.`,
  );
}

function exists(target) {
  try {
    return fs.existsSync(target);
  } catch {
    // An unreadable path is an unknown answer, and unknown means refuse.
    return true;
  }
}
