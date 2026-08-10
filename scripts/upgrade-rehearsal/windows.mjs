/**
 * Building, installing and launching the real Windows packages.
 *
 * Nothing here simulates anything: the released version is built from its own
 * tag with its own lockfile, installed by its own NSIS package, and launched
 * as the installed executable. The upgrade that follows is performed by
 * electron-updater inside that process.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** Where the per-user NSIS package puts the application. */
export function installedApplicationPath(env = process.env) {
  return path.join(
    env.LOCALAPPDATA ?? "",
    "Programs",
    "arak-rental-desk",
    "ARAK Rental Desk.exe",
  );
}

/** electron-builder writes `resources/app-update.yml` beside the executable. */
export function resourcesPathFor(applicationPath) {
  return path.join(path.dirname(applicationPath), "resources");
}

/** Runs a command to completion, capturing output for the report. */
export function run(command, args, { cwd, env, timeoutMs = 45 * 60_000, log } = {}) {
  return new Promise((resolve, reject) => {
    const canonicalCwd = cwd ? fs.realpathSync.native(cwd) : undefined;

    log?.(`  $ ${command} ${args.join(" ")}`);
    if (cwd && canonicalCwd !== cwd) {
      log?.(`    cwd resolved from ${cwd} to ${canonicalCwd}`);
    }

    const child = spawn(command, args, {
      cwd: canonicalCwd,
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} exited ${code}\n--- stdout ---\n${tail(stdout)}\n--- stderr ---\n${tail(stderr)}`,
        ),
      );
    });
  });
}

/**
 * Builds a released tag from its own source and lockfile.
 *
 * A git worktree rather than a checkout, so the branch under test is never
 * disturbed, and `npm ci` rather than `npm install`, so the released build
 * gets the dependency tree it shipped with.
 */
export async function buildReleasedVersion({ repoPath, tag, workPath, log }) {
  await run("git", ["worktree", "add", "--detach", workPath, tag], {
    cwd: repoPath,
    log,
  });

  await run("npm", ["ci"], { cwd: workPath, log });
  await run("npm", ["run", "dist"], { cwd: workPath, log });

  const releasePath = path.join(workPath, "release");
  const installer = fs
    .readdirSync(releasePath)
    .find((name) => name.startsWith("ARAK-Rental-Desk-Setup-") && name.endsWith(".exe"));

  if (!installer) {
    throw new Error(`no installer was produced in ${releasePath}`);
  }

  return {
    releasePath,
    installerPath: path.join(releasePath, installer),
    installerName: installer,
  };
}

/** Removes the worktree again, leaving the repository as it was found. */
export async function removeWorktree({ repoPath, workPath, log }) {
  await run("git", ["worktree", "remove", "--force", workPath], {
    cwd: repoPath,
    log,
  }).catch((error) => log?.(`  could not remove the worktree: ${error.message}`));
}

/**
 * Runs the NSIS package silently and waits for the executable to appear. The
 * one-click installer returns before it has finished writing, so the presence
 * of the executable is what is actually waited on.
 */
export async function installSilently(installerPath, { log, timeoutMs = 10 * 60_000 } = {}) {
  await run(installerPath, ["/S"], { log, timeoutMs });

  const applicationPath = installedApplicationPath();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(applicationPath)) {
      // The installer also launches the app on completion; give it a moment
      // and then make sure nothing is holding the files.
      await delay(3000);
      return applicationPath;
    }

    await delay(1000);
  }

  throw new Error(`the installer finished but ${applicationPath} never appeared`);
}

/** Starts the installed application with a debugging port open. */
export function launchApplication(applicationPath, { port, env, log } = {}) {
  log?.(`  launching ${applicationPath} with --remote-debugging-port=${port}`);

  const child = spawn(
    applicationPath,
    [`--remote-debugging-port=${port}`, "--remote-allow-origins=*"],
    {
      env: { ...process.env, ...env },
      detached: false,
      stdio: "ignore",
      windowsHide: false,
    },
  );

  child.on("error", (error) => log?.(`  launch error: ${error.message}`));

  return child;
}

/**
 * Ends every process of the application, whichever way it was started. The
 * updater relaunches the app itself, so the harness cannot rely on holding a
 * handle to the process it needs to stop.
 */
export async function stopApplication({ log } = {}) {
  await run("taskkill", ["/IM", "ARAK Rental Desk.exe", "/F", "/T"], { log }).catch(
    () => {
      // Not running is the desired end state, so a failure here is fine.
    },
  );

  // SQLite releases its WAL when the last handle closes; reading too soon can
  // otherwise see a database that is still being checkpointed.
  await delay(3000);
}

/** True while any application process is alive. */
export async function isApplicationRunning() {
  return (await applicationPids()).length > 0;
}

/**
 * Every live process id for the application, newest last.
 *
 * The handoff is tracked by pid rather than by image name because
 * `quitAndInstall` can end the old process and start the new one between two
 * polls. "No process with this name" would then never be observed, and a
 * name-only wait would either hang or, worse, decide the relaunch had already
 * happened while the old process was still running.
 */
export async function applicationPids() {
  const result = await run("tasklist", [
    "/FI",
    "IMAGENAME eq ARAK Rental Desk.exe",
    "/FO",
    "CSV",
    "/NH",
  ]).catch(() => ({ stdout: "" }));

  return result.stdout
    .split(/\r?\n/)
    .map((line) => /^"[^"]*","(\d+)"/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((left, right) => left - right);
}

/**
 * The pid of the process that owns the window the harness is driving. Electron
 * spawns renderer and GPU children under the same image name, so the lowest
 * pid — the first one started — is the main process.
 */
export async function mainProcessPid() {
  const pids = await applicationPids();

  return pids.length > 0 ? pids[0] : null;
}

/**
 * Follows the updater's handoff by process id.
 *
 * Three things have to be observed in order, and each is checked against the
 * pid recorded before `restartAndInstall` was invoked:
 *
 *   1. the original main process is gone,
 *   2. a process appears that is not the original one,
 *   3. that new process is still alive a few seconds later.
 *
 * The third step matters because NSIS briefly runs the application during the
 * install; a pid that vanishes again was the installer's, not the upgraded
 * app's, and waiting for the next one avoids reading a database that is about
 * to be reopened.
 */
export async function waitForUpdaterHandoff(
  originalPid,
  { exitTimeoutMs = 5 * 60_000, relaunchTimeoutMs = 10 * 60_000, stableForMs = 8000, log } = {},
) {
  const exitDeadline = Date.now() + exitTimeoutMs;

  while (Date.now() < exitDeadline) {
    const pids = await applicationPids();

    if (!pids.includes(originalPid)) {
      log?.(`  original process ${originalPid} is gone`);
      break;
    }

    log?.(`  waiting for process ${originalPid} to exit`);
    await delay(2000);

    if (Date.now() >= exitDeadline) {
      throw new Error(
        `process ${originalPid} never exited after restartAndInstall`,
      );
    }
  }

  const relaunchDeadline = Date.now() + relaunchTimeoutMs;

  while (Date.now() < relaunchDeadline) {
    const candidates = (await applicationPids()).filter((pid) => pid !== originalPid);

    if (candidates.length > 0) {
      const candidate = candidates[0];

      // Let it settle, then confirm it is the same process still running.
      await delay(stableForMs);
      const stillAlive = (await applicationPids()).includes(candidate);

      if (stillAlive) {
        log?.(`  upgraded application is running as ${candidate}`);
        return { originalPid, newPid: candidate };
      }

      log?.(`  process ${candidate} came and went; still waiting`);
      continue;
    }

    log?.("  waiting for the updated application to start");
    await delay(2000);
  }

  throw new Error(
    `no new process replaced ${originalPid} within ${Math.round(relaunchTimeoutMs / 1000)}s`,
  );
}

function tail(text, lines = 40) {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}
