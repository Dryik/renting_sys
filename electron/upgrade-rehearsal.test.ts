import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { toMinorUnits, toMinorUnitsOrNull } from "../src/shared/money";
import { moneyColumnPairs, triggerName } from "./db/money-columns";
import {
  decideEnvironment,
  disposableMarker,
  type RehearsalEnvironmentProbe,
} from "../scripts/upgrade-rehearsal/environment.mjs";
import {
  expectedMoneyPairs,
  expectedTriggerNameList,
  toMinorUnits as rehearsalToMinorUnits,
  toMinorUnitsOrNull as rehearsalToMinorUnitsOrNull,
} from "../scripts/upgrade-rehearsal/money.mjs";
import { seedMileageScenarios } from "../scripts/upgrade-rehearsal/seed.mjs";
import {
  readUpgradeMethod,
  upgradeMethodValues,
} from "../scripts/upgrade-rehearsal/method.mjs";

/**
 * A machine that should be allowed: a fresh hosted runner with the opt-in set
 * and none of the product's directories present. Every test below starts here
 * and breaks exactly one thing, so a passing case that stops passing points at
 * the rule that changed.
 */
function disposableRunner(
  overrides: Partial<RehearsalEnvironmentProbe> = {},
): RehearsalEnvironmentProbe {
  return {
    platform: "win32",
    markerValue: disposableMarker.value,
    isGithubHostedRunner: true,
    isWindowsSandbox: false,
    hasDisposableMarkerFile: false,
    markerFilePath: "C:\\disposable-rehearsal-vm.txt",
    productUserDataPath: "C:\\Users\\runneradmin\\AppData\\Roaming\\ARAK Rental Desk",
    hasProductUserData: false,
    installedProgramPath: "C:\\Users\\runneradmin\\AppData\\Local\\Programs\\arak-rental-desk",
    hasInstalledProgram: false,
    updaterCachePath: "C:\\Users\\runneradmin\\AppData\\Local\\arak-rental-desk-updater",
    hasUpdaterCache: false,
    ...overrides,
  };
}

describe("who is allowed to run the upgrade rehearsal", () => {
  it("allows a fresh hosted Windows runner that opted in", () => {
    const decision = decideEnvironment(disposableRunner());

    expect(decision.allowed).toBe(true);
    expect(decision.refusals).toEqual([]);
    expect(decision.signals).toContain("GitHub-hosted runner");
  });

  it("allows Windows Sandbox", () => {
    const decision = decideEnvironment(
      disposableRunner({ isGithubHostedRunner: false, isWindowsSandbox: true }),
    );

    expect(decision.allowed).toBe(true);
  });

  it("allows a VM the operator stamped with the marker file", () => {
    const decision = decideEnvironment(
      disposableRunner({ isGithubHostedRunner: false, hasDisposableMarkerFile: true }),
    );

    expect(decision.allowed).toBe(true);
  });
});

describe("what the rehearsal refuses", () => {
  it("refuses without the opt-in variable", () => {
    expect(decideEnvironment(disposableRunner({ markerValue: undefined })).allowed).toBe(
      false,
    );
  });

  it("refuses a near-miss opt-in value", () => {
    // "1" or "true" is the kind of thing someone exports while debugging.
    for (const value of ["1", "true", "yes", ""]) {
      expect(decideEnvironment(disposableRunner({ markerValue: value })).allowed).toBe(
        false,
      );
    }
  });

  it("refuses when the machine offers no disposable signal of its own", () => {
    // The variable alone is not enough: it can be exported in any shell.
    const decision = decideEnvironment(
      disposableRunner({
        isGithubHostedRunner: false,
        isWindowsSandbox: false,
        hasDisposableMarkerFile: false,
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.signals).toEqual([]);
  });

  it("refuses a machine that already holds real application data", () => {
    const decision = decideEnvironment(disposableRunner({ hasProductUserData: true }));

    expect(decision.allowed).toBe(false);
    expect(decision.refusals.join(" ")).toContain("real data directory");
  });

  it("refuses a machine with the application already installed", () => {
    expect(decideEnvironment(disposableRunner({ hasInstalledProgram: true })).allowed).toBe(
      false,
    );
  });

  it("refuses a machine with an updater cache from earlier use", () => {
    expect(decideEnvironment(disposableRunner({ hasUpdaterCache: true })).allowed).toBe(
      false,
    );
  });

  it("refuses anything that is not Windows", () => {
    expect(decideEnvironment(disposableRunner({ platform: "linux" })).allowed).toBe(false);
    expect(decideEnvironment(disposableRunner({ platform: "darwin" })).allowed).toBe(false);
  });

  it("reports every reason at once rather than one at a time", () => {
    const decision = decideEnvironment(
      disposableRunner({
        markerValue: undefined,
        isGithubHostedRunner: false,
        hasProductUserData: true,
        hasInstalledProgram: true,
      }),
    );

    expect(decision.refusals.length).toBeGreaterThanOrEqual(4);
  });

  it("refuses a developer machine even with the opt-in exported", () => {
    // The case this guard exists for: someone runs it in their own checkout.
    const decision = decideEnvironment(
      disposableRunner({
        isGithubHostedRunner: false,
        hasProductUserData: true,
        hasInstalledProgram: true,
        hasUpdaterCache: true,
      }),
    );

    expect(decision.allowed).toBe(false);
  });
});

describe("the rehearsal's restatement of the money rules", () => {
  /**
   * The harness converts with its own copy of the algorithm, so that a bug in
   * production's converter cannot agree with itself and pass. These hold the
   * copy to the original.
   */
  const halfCents = [1.005, 2.675, -1.005, -2.675, 0.005, -0.005, 100.005, -100.005];

  it.each(halfCents)("rounds %p half away from zero, exactly as production does", (value) => {
    expect(rehearsalToMinorUnits(value)).toBe(toMinorUnits(value));
  });

  it("rounds the documented half-cents to the documented integers", () => {
    // Pinned rather than only cross-checked: if both copies drifted the same
    // way, the comparison above would still pass.
    expect(rehearsalToMinorUnits(1.005)).toBe(101);
    expect(rehearsalToMinorUnits(2.675)).toBe(268);
    expect(rehearsalToMinorUnits(-1.005)).toBe(-101);
    expect(rehearsalToMinorUnits(-2.675)).toBe(-268);
  });

  it("agrees with production across a wide sweep", () => {
    const values: number[] = [0, -0, 0.1, 0.2, 12.345, -12.345, 19.99, 33.33, 1e6 + 0.005];

    for (let cents = -5000; cents <= 5000; cents += 7) {
      values.push(cents / 100, cents / 100 + 0.005, cents / 1000);
    }

    for (const value of values) {
      expect(rehearsalToMinorUnits(value)).toBe(toMinorUnits(value));
    }
  });

  it("keeps null null, like the nullable columns it checks", () => {
    expect(rehearsalToMinorUnitsOrNull(null)).toBeNull();
    expect(rehearsalToMinorUnitsOrNull(undefined)).toBeNull();
    expect(rehearsalToMinorUnitsOrNull(1.005)).toBe(toMinorUnitsOrNull(1.005));
  });

  it("would reject the mirror-division shortcut on a historical value", () => {
    // The bug this replaced: migration 12 leaves 100.005 in the REAL column
    // while the integer column becomes 10001. Dividing back gives 100.01, so
    // an equality check against the mirror fails a correct row.
    const legacy = 100.005;
    const minor = rehearsalToMinorUnits(legacy);

    expect(minor).toBe(10001);
    expect(minor / 100).not.toBe(legacy);
    expect(rehearsalToMinorUnits(legacy)).toBe(minor);
  });
});

describe("the rehearsal's restatement of the money column inventory", () => {
  it("lists exactly the pairs production migrates", () => {
    const production = moneyColumnPairs
      .map((pair) => `${pair.table}.${pair.legacyColumn}.${pair.minorColumn}.${pair.nullable}`)
      .sort();
    const rehearsal = expectedMoneyPairs
      .map((pair) => `${pair.table}.${pair.legacyColumn}.${pair.minorColumn}.${pair.nullable}`)
      .sort();

    expect(rehearsal).toEqual(production);
  });

  it("counts 29 pairs", () => {
    expect(expectedMoneyPairs).toHaveLength(29);
    expect(moneyColumnPairs).toHaveLength(29);
  });

  it("expects exactly the 58 trigger names production generates", () => {
    const production = moneyColumnPairs
      .flatMap((pair) => [triggerName(pair, "insert"), triggerName(pair, "update")])
      .sort();

    expect(expectedTriggerNameList.slice().sort()).toEqual(production);
    expect(expectedTriggerNameList).toHaveLength(58);
  });
});

describe("the released-build seed data", () => {
  it("never sends a vehicle out below its current mileage", () => {
    for (const scenario of Object.values(seedMileageScenarios)) {
      if (scenario.out !== null) {
        expect(scenario.out).toBeGreaterThanOrEqual(scenario.vehicle);
      }
    }
  });

  it("never returns a vehicle below its mileage out", () => {
    for (const scenario of Object.values(seedMileageScenarios)) {
      if (scenario.in !== null) {
        expect(scenario.out).not.toBeNull();
        expect(scenario.in).toBeGreaterThanOrEqual(scenario.out ?? 0);
      }
    }
  });
});

describe("the two release installation paths", () => {
  it("defaults to the electron-updater rehearsal", () => {
    expect(readUpgradeMethod(undefined)).toBe("updater");
  });

  it.each(upgradeMethodValues)("accepts %s", (method) => {
    expect(readUpgradeMethod(method)).toBe(method);
  });

  it("rejects an unknown installation path", () => {
    expect(() => readUpgradeMethod("direct-copy")).toThrow(
      /RENTAL_UPGRADE_METHOD/,
    );
  });
});

describe("release invariants the updater depends on", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    version: string;
    scripts?: Record<string, string>;
    build?: { artifactName?: string; nsis?: { differentialPackage?: boolean } };
  };

  it("keeps artifactName hyphenated", () => {
    // Spaces in the artifact name break electron-updater on every client.
    expect(packageJson.build?.artifactName).toBe(
      "ARAK-Rental-Desk-Setup-${version}.${ext}",
    );
    expect(packageJson.build?.artifactName).not.toContain(" ");
  });

  it("carries a version the feed can advertise", () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("agrees with both root version entries in the lockfile", () => {
    // `npm ci` fails outright when these disagree, and the rehearsal builds
    // the old version with `npm ci`. A stale lockfile version also ships the
    // wrong number inside the packaged app.
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };

    expect(lock.version).toBe(packageJson.version);
    expect(lock.packages[""]?.version).toBe(packageJson.version);
  });

  it("gives the rehearsal the same target version, from one place", () => {
    // The harness reads its target from package.json rather than repeating a
    // literal, so there is nothing to keep in step by hand.
    const orchestrator = fs.readFileSync(
      "scripts/upgrade-rehearsal/index.mjs",
      "utf8",
    );

    expect(orchestrator).toContain('fs.readFileSync(path.join(repositoryPath, "package.json"), "utf8"),\n  ).version');
    expect(orchestrator).not.toContain(packageJson.version);
  });

  it("exposes the rehearsal as its own command", () => {
    expect(packageJson.scripts?.["test:upgrade"]).toBe(
      "node scripts/upgrade-rehearsal/index.mjs",
    );
  });

  it("has a Windows-only workflow that fails closed", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/upgrade-rehearsal.yml",
      "utf8",
    );

    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain(disposableMarker.name);
    expect(workflow).toContain(disposableMarker.value);
    expect(workflow).toContain("method: [updater, manual-installer]");
    expect(workflow).toContain("RENTAL_UPGRADE_METHOD: ${{ matrix.method }}");
    // A rehearsal must never turn into a publish.
    expect(workflow).not.toContain("softprops/action-gh-release");
    expect(workflow).not.toContain("--publish always");
    expect(workflow).not.toMatch(/^\s*run:.*git tag/m);
  });
});
