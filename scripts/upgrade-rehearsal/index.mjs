/**
 * The Windows upgrade rehearsal: prove that a real 0.3.9 installation, holding
 * real data written by the released code, survives both supported upgrade
 * paths to this version with nothing lost or changed.
 *
 * What makes this different from the migration tests in `npm test`: nothing
 * here calls the migration runner. A released package is built from its own
 * tag, installed by its own NSIS installer, launched, filled with data through
 * its own IPC bridge, and then upgraded either by electron-updater or by
 * running the new installer over the existing installation. The migration
 * happens because the new application opened an old file, which is the only
 * way a shop will ever experience it.
 *
 *   npm run dist
 *   npm run test:upgrade
 *
 * It refuses to run outside a disposable machine. See `environment.mjs` for
 * what that means and why the refusal is not negotiable.
 */
import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { connectToApp, pollUntil } from "./cdp.mjs";
import {
  hashUploads,
  openReadOnly,
  readIntegrity,
  readManifest,
  readSchemaVersion,
  readTableCounts,
} from "./database.mjs";
import { assertDisposableEnvironment, productUserDataDirectoryName } from "./environment.mjs";
import { redirectInstalledCopyToFeed, readYamlScalar, startUpdateFeed } from "./feed.mjs";
import {
  expectedMoneyPairs,
  expectedTriggerNameList,
  toMinorUnitsOrNull,
} from "./money.mjs";
import { readUpgradeMethod } from "./method.mjs";
import { buildSeedExpression } from "./seed.mjs";
import {
  buildReleasedVersion,
  installSilently,
  launchApplication,
  mainProcessPid,
  removeWorktree,
  resourcesPathFor,
  stopApplication,
  waitForUpdaterHandoff,
} from "./windows.mjs";

const repositoryPath = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const releasedTag = process.env.RENTAL_UPGRADE_FROM_TAG ?? "v0.3.9";
const debuggingPort = Number(process.env.RENTAL_UPGRADE_DEBUG_PORT ?? 9411);
const upgradeMethod = readUpgradeMethod(process.env.RENTAL_UPGRADE_METHOD);

const lines = [];
const checks = [];
/** Accumulated by the phases and the comparisons, written out at the end. */
const report = {};

function log(line) {
  lines.push(line);
  console.log(line);
}

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  checks.push({ label, ok, actual, expected });
  log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(58)} ${truncate(JSON.stringify(actual))}`);

  return ok;
}

async function main() {
  log("--- upgrade rehearsal ---");

  const { probe, decision } = assertDisposableEnvironment();
  log(`  environment: disposable (${decision.signals.join(", ")})`);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-rehearsal-"));
  const worktreePath = path.join(workspace, "released-source");
  const feedPath = path.join(workspace, "feed");
  const reportPath =
    process.env.RENTAL_UPGRADE_REPORT ?? path.join(workspace, "rehearsal-report.json");

  // The installed application writes here, exactly as it would on a shop's
  // machine. The guard has already refused if this existed beforehand.
  const userDataPath = path.join(process.env.APPDATA, productUserDataDirectoryName);
  const databasePath = path.join(userDataPath, "rental_app.db");
  const uploadsPath = path.join(userDataPath, "uploads");
  const migrationBackupsPath = path.join(userDataPath, "migration_backups");

  const newVersion = JSON.parse(
    fs.readFileSync(path.join(repositoryPath, "package.json"), "utf8"),
  ).version;

  log(`  workspace:   ${workspace}`);
  log(`  upgrading:   ${releasedTag} -> ${newVersion}`);
  log(`  method:      ${upgradeMethod}`);
  log(`  data:        ${userDataPath}`);

  Object.assign(report, {
    startedAt: new Date().toISOString(),
    releasedTag,
    newVersion,
    upgradeMethod,
    workspace,
    userDataPath,
    environment: { signals: decision.signals, probe: redactProbe(probe) },
  });

  let feed = null;

  try {
    // ---------------------------------------------------------------- 1. old
    log("");
    log("[1/8] building the released package from its own tag and lockfile");
    const released = await buildReleasedVersion({
      repoPath: repositoryPath,
      tag: releasedTag,
      workPath: worktreePath,
      log,
    });
    log(`  built ${released.installerName}`);
    report.oldInstaller = released.installerName;

    log("");
    log("[2/8] installing it");
    const applicationPath = await installSilently(released.installerPath, { log });
    await stopApplication({ log });
    log(`  installed at ${applicationPath}`);

    // ------------------------------------------------------------- 2. seeding
    log("");
    log("[3/8] launching the released application and seeding synthetic data");
    // The process handle is deliberately dropped: the updater replaces this
    // process with one the harness never spawned, so every shutdown goes
    // through `stopApplication`, which works on whichever process is alive.
    launchApplication(applicationPath, { port: debuggingPort, log });
    let client = await connectToApp(debuggingPort, { log });

    const seeded = await client.evaluate(buildSeedExpression());
    if (!seeded?.ok) {
      throw new Error(
        `seeding failed at step "${seeded?.failedStep}": ${seeded?.message}\n` +
          `completed: ${(seeded?.completedSteps ?? []).join(", ")}`,
      );
    }
    log(`  seeded ${seeded.steps?.length ?? "all"} steps, audit rows: ${seeded.auditRows}`);
    report.seed = seeded;

    const oldAppInfo = await client.evaluate("window.rentalApp.getAppInfo()");
    check("the seeded application is the released version", oldAppInfo?.version, releasedTag.replace(/^v/, ""));

    client.close();
    await stopApplication({ log });

    // ------------------------------------------------------- 3. pre manifest
    log("");
    log("[4/8] recording the pre-upgrade manifest");
    const before = readManifest(databasePath, uploadsPath, expectedMoneyPairs);
    report.before = before;
    log(`  schema version ${before.schemaVersion}, ${before.uploads.length} uploaded file(s)`);
    check("the seeded file is at schema version 11", before.schemaVersion, 11);
    check("the released file has no minor-unit columns yet", before.minorColumns.length, 0);
    check("uploaded files exist before the upgrade", before.uploads.length > 0, true);

    // -------------------------------------------------------- 4. new package
    log("");
    log("[5/8] validating the new package artifacts");
    fs.mkdirSync(feedPath, { recursive: true });
    const artifacts = copyReleaseArtifacts(
      path.join(repositoryPath, "release"),
      feedPath,
      newVersion,
    );
    report.newArtifacts = artifacts.names;
    log(`  found ${artifacts.names.join(", ")}`);

    if (upgradeMethod === "updater") {
      feed = await startUpdateFeed(feedPath, artifacts.names);
      const redirect = redirectInstalledCopyToFeed(
        resourcesPathFor(applicationPath),
        feed.url,
      );
      log(`  ${redirect.configPath} now points at ${feed.url}`);
      report.feedUrl = feed.url;
      report.appUpdateYmlBefore = redirect.original.trim();
      report.appUpdateYmlAfter = redirect.replacement.trim();
    }

    // ----------------------------------------------------------- 5. upgrade
    log("");
    if (upgradeMethod === "updater") {
      log("[6/8] running the real updater");
      launchApplication(applicationPath, { port: debuggingPort, log });
      client = await connectToApp(debuggingPort, { log });

      const originalPid = await mainProcessPid();
      log(`  main process is ${originalPid}`);

      // Record every status the main process broadcasts, so the report can show
      // the sequence rather than only the end state.
      await client.evaluate(`
        window.__rehearsalUpdateEvents = [];
        window.rentalApp.updates.onStatusChange((state) => {
          window.__rehearsalUpdateEvents.push({ at: Date.now(), ...state });
        });
        true
      `);

      // A packaged build already runs `checkForUpdatesAndNotify` at startup, so
      // by now a check or download may be under way. Calling `checkForUpdates`
      // on top of that starts a second download of the same package against the
      // same cache. Read the state first and only push it along if nothing has
      // begun.
      const initialState = await client.evaluate(
        "window.rentalApp.updates.getUpdateState()",
      );
      log(`  update state on arrival: ${JSON.stringify(initialState)}`);
      report.initialUpdateState = initialState;

      const automaticCheckStarted = ["checking", "available", "downloading", "downloaded"].includes(
        initialState?.status,
      );

      if (automaticCheckStarted) {
        log("  the startup check is already running; not starting a second one");
        report.manualCheckInvoked = false;
      } else {
        const triggered = await client.evaluate(
          "window.rentalApp.updates.checkForUpdates()",
        );
        log(`  checkForUpdates -> ${JSON.stringify(triggered)}`);
        report.manualCheckInvoked = true;
        report.manualCheckResult = triggered;
      }

      const downloaded = await pollUntil(
        client,
        "window.rentalApp.updates.getUpdateState()",
        (state) => state?.status === "downloaded" || state?.status === "error",
        { timeoutMs: 15 * 60_000, intervalMs: 2000, log },
      );

      const events = await client.evaluate("window.__rehearsalUpdateEvents");
      report.updateEvents = events;
      log(`  update events: ${JSON.stringify(events)}`);

      if (downloaded?.status !== "downloaded") {
        throw new Error(`the updater did not download: ${JSON.stringify(downloaded)}`);
      }

      check("the updater offered the new version", downloaded.version, newVersion);
      check(
        "the feed served latest.yml and the package",
        feed.requests.some((request) => request.name === "latest.yml") &&
          feed.requests.some((request) => request.name.endsWith(".exe")),
        true,
      );

      log("  invoking the real restart-and-install channel");
      await client.evaluate("window.rentalApp.updates.restartAndInstall()").catch(() => {
        // The channel never resolves: the process is being replaced underneath it.
      });
      client.close("the application is restarting");

      const handoff = await waitForUpdaterHandoff(originalPid, { log });
      report.handoff = handoff;
      check("the updater replaced the original process", handoff.newPid !== originalPid, true);

      await stopApplication({ log });
    } else {
      log("[6/8] installing the new package over the existing installation");
      const newInstallerPath = path.join(
        repositoryPath,
        "release",
        artifacts.names[0],
      );
      const installedPath = await installSilently(newInstallerPath, { log });
      check(
        "the manual installer kept the application path",
        path.resolve(installedPath),
        path.resolve(applicationPath),
      );

      // NSIS launches the application when installation completes. Stop that
      // copy, then start one with CDP enabled so the reported version proves
      // that the executable on disk was actually replaced.
      await stopApplication({ log });
      launchApplication(installedPath, { port: debuggingPort, log });
      client = await connectToApp(debuggingPort, { log });
      const installedAppInfo = await client.evaluate("window.rentalApp.getAppInfo()");
      check(
        "the manual installer launched the new version",
        installedAppInfo?.version,
        newVersion,
      );
      client.close();
      await stopApplication({ log });
      report.manualInstallation = { installer: artifacts.names[0], installedPath };
    }

    // ------------------------------------------------------- 6. post manifest
    log("");
    log("[7/8] verifying the upgraded installation");
    const after = readManifest(databasePath, uploadsPath, expectedMoneyPairs);
    report.after = after;

    check("the database is at schema version 12", after.schemaVersion, 12);
    check("integrity_check reports ok", after.integrity.integrityCheck, ["ok"]);
    check("foreign_key_check returns no rows", after.integrity.foreignKeyViolations, []);
    check(
      "all 29 minor-unit columns exist, exactly the expected ones",
      after.minorColumns.slice().sort(),
      expectedMoneyPairs
        .map((pair) => `${pair.table}.${pair.minorColumn}`)
        .sort(),
    );
    check(
      "all 58 mirror triggers exist, exactly the expected ones",
      after.mirrorTriggers.slice().sort(),
      expectedTriggerNameList.slice().sort(),
    );

    compareBusinessCounts(before.tableCounts, after.tableCounts);
    compareRepresentatives(before.representatives, after.representatives);
    compareUploads(before.uploads, after.uploads);
    compareMonetaryTotals(before.monetaryTotals, after.monetaryTotals);
    compareMoneyPairs(before.moneyPairRows, after.moneyPairRows);

    // -------------------------------------------------- 7. migration archive
    const archive = verifyMigrationArchive(migrationBackupsPath, {
      workspace,
      before,
      log,
    });
    report.migrationArchive = archive;
    check("a migration safety archive was written", archive.found, true);
    check(
      "it is marked as a pre-migration safety backup",
      archive.backupType,
      "safety_before_migration",
    );
    check(
      "it records the upgrade it protected",
      [archive.sourceSchemaVersion, archive.targetSchemaVersion],
      [11, 12],
    );
    check("the archived database is itself at version 11", archive.restoredSchemaVersion, 11);
    check("the archived database passes integrity_check", archive.restoredIntegrity, ["ok"]);
    check(
      "the archived database has no foreign key violations",
      archive.restoredForeignKeyViolations,
      [],
    );
    check("it restores to the pre-upgrade row counts", archive.countsMatch, true);
    check("it restores the pre-upgrade uploads byte for byte", archive.uploadsMatch, true);

    // ------------------------------------------------------ 8. second launch
    log("");
    log("[8/8] starting the upgraded application a second time");
    const backupsBefore = countFiles(migrationBackupsPath);

    launchApplication(applicationPath, { port: debuggingPort, log });
    client = await connectToApp(debuggingPort, { log });

    const newAppInfo = await client.evaluate("window.rentalApp.getAppInfo()");
    check("the application reports the new version", newAppInfo?.version, newVersion);

    const login = await client.evaluate(`
      (async () => {
        await window.rentalApp.auth.logout();
        const state = await window.rentalApp.auth.login({
          username: "rehearsalowner",
          password: "1234",
        });
        const settings = await window.rentalApp.settings.get();
        return {
          isAuthenticated: state.isAuthenticated,
          shopName: settings.shopName,
          language: settings.language,
        };
      })()
    `);
    log(`  login and settings: ${JSON.stringify(login)}`);
    check("login still works after the upgrade", login?.isAuthenticated, true);
    check("settings survived the upgrade", login?.shopName, "Rehearsal Rentals");

    client.close();
    await stopApplication({ log });

    const secondManifest = readManifest(databasePath, uploadsPath, expectedMoneyPairs);
    check("the second launch did not migrate again", secondManifest.schemaVersion, 12);
    check(
      "the second launch wrote no new safety backup",
      countFiles(migrationBackupsPath),
      backupsBefore,
    );

    report.checks = checks;
    report.finishedAt = new Date().toISOString();
  } finally {
    await feed?.close();
    await stopApplication({ log }).catch(() => {});
    await removeWorktree({ repoPath: repositoryPath, workPath: worktreePath, log });
    fs.writeFileSync(reportPath, JSON.stringify({ ...report, checks, log: lines }, null, 2));
    log("");
    log(`  report written to ${reportPath}`);
  }

  const failures = checks.filter((entry) => !entry.ok);
  log("");
  log(`--- ${failures.length === 0 ? "all checks passed" : `${failures.length} CHECK(S) FAILED`} ---`);

  return failures.length === 0 ? 0 : 1;
}

/**
 * Counts must match for every business table. `app_settings` is excluded
 * because the migration legitimately rewrites the schema version row.
 */
function compareBusinessCounts(before, after) {
  const drifted = [];

  for (const [table, count] of Object.entries(before)) {
    if (table === "app_settings") {
      continue;
    }

    if (after[table] !== count) {
      drifted.push({ table, before: count, after: after[table] ?? null });
    }
  }

  check("every business row count is unchanged", drifted, []);
}

/** The money values a user would see, compared exactly. */
function compareRepresentatives(before, after) {
  const drifted = [];

  for (const group of before) {
    const match = after.find((candidate) => candidate.label === group.label);

    if (JSON.stringify(group.rows) !== JSON.stringify(match?.rows)) {
      drifted.push({
        label: group.label,
        before: group.rows,
        after: match?.rows ?? null,
      });
    }
  }

  check(
    "representative rental, payment, refund, commission, accounting and loan values are unchanged",
    drifted.map((entry) => entry.label),
    [],
  );

  if (drifted.length > 0) {
    log(`  drift detail: ${truncate(JSON.stringify(drifted), 4000)}`);
  }
}

function compareUploads(before, after) {
  const byPath = new Map(after.map((file) => [file.path, file]));
  const drifted = before.filter(
    (file) => byPath.get(file.path)?.sha256 !== file.sha256,
  );

  check("every uploaded file is present with an identical SHA-256", drifted, []);
}

/**
 * The exhaustive money proof, over all 29 pairs and every row in them.
 *
 * Three separate claims, because they fail for different reasons:
 *
 *   1. the same row ids are present afterwards,
 *   2. each id's major-unit value is byte-identical — the migration must not
 *      rewrite a REAL column,
 *   3. each new integer column is `toMinorUnits` of that untouched value.
 *
 * The third is deliberately not `legacy === minor / 100`. Migration 12 leaves
 * historical values alone, so a row seeded as 100.005 keeps 100.005 while its
 * minor becomes 10001; dividing back gives 100.01 and would fail a correct
 * migration. Rounding forwards is the relationship that actually holds.
 */
function compareMoneyPairs(before, after) {
  const missingPairs = [];
  const idDrift = [];
  const valueDrift = [];
  const conversionDrift = [];
  let rowsChecked = 0;

  for (const pair of expectedMoneyPairs) {
    const key = `${pair.table}.${pair.legacyColumn}`;
    const was = before[key];
    const now = after[key];

    if (!now || now.missingTable || !now.hasMinorColumn) {
      missingPairs.push(key);
      continue;
    }

    const beforeIds = (was?.rows ?? []).map((row) => row.id);
    const afterIds = now.rows.map((row) => row.id);

    if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
      idDrift.push({ column: key, before: beforeIds, after: afterIds });
      continue;
    }

    const beforeById = new Map((was?.rows ?? []).map((row) => [row.id, row.legacy]));

    for (const row of now.rows) {
      rowsChecked += 1;
      const original = beforeById.get(row.id);

      if (!Object.is(original ?? null, row.legacy ?? null)) {
        valueDrift.push({ column: key, id: row.id, before: original, after: row.legacy });
        continue;
      }

      const expected = toMinorUnitsOrNull(row.legacy);

      if (!Object.is(expected, row.minor ?? null)) {
        conversionDrift.push({
          column: key,
          id: row.id,
          legacy: row.legacy,
          minor: row.minor ?? null,
          expected,
        });
      }
    }
  }

  log(`  money proof covered ${rowsChecked} row(s) across ${expectedMoneyPairs.length} pairs`);

  check("every expected money pair carries its minor column", missingPairs, []);
  check("every money column kept the same row ids", idDrift.map((entry) => entry.column), []);
  check("every stored major-unit value is untouched", valueDrift, []);
  check("every minor value is the conversion of its mirror", conversionDrift, []);

  // A pair with no rows proves nothing, so say which ones the seed did not
  // reach. This is reported rather than asserted: some columns only exist on
  // rows a shop may never create.
  const empty = expectedMoneyPairs
    .map((pair) => `${pair.table}.${pair.legacyColumn}`)
    .filter((key) => (after[key]?.rows ?? []).length === 0);

  if (empty.length > 0) {
    log(`  pairs with no rows to check: ${empty.join(", ")}`);
  }
  report.moneyPairsWithoutRows = empty;
}

/** The recorded totals, actually compared rather than merely stored. */
function compareMonetaryTotals(before, after) {
  const drifted = [];

  for (const [key, total] of Object.entries(before)) {
    // Version 11 has no minor totals to compare against.
    if (key.endsWith("_minor")) {
      continue;
    }

    if (!Object.is(after[key], total)) {
      drifted.push({ column: key, before: total, after: after[key] ?? null });
    }
  }

  check("every monetary total is unchanged", drifted, []);
}

/**
 * Opens the archive the migration wrote before touching anything, extracts it,
 * and checks that what comes out is the version 11 file that went in.
 */
function verifyMigrationArchive(migrationBackupsPath, { workspace, before, log }) {
  if (!fs.existsSync(migrationBackupsPath)) {
    return { found: false };
  }

  const archives = fs
    .readdirSync(migrationBackupsPath)
    .filter((name) => name.endsWith(".zip"))
    .sort();

  if (archives.length === 0) {
    return { found: false };
  }

  const archivePath = path.join(migrationBackupsPath, archives.at(-1));
  const extractPath = path.join(workspace, "restored-v11");

  log(`  verifying ${archivePath}`);

  const zip = new AdmZip(archivePath);
  zip.extractAllTo(extractPath, true);

  const metadata = JSON.parse(
    fs.readFileSync(path.join(extractPath, "metadata.json"), "utf8"),
  );
  const restoredDatabase = path.join(extractPath, "rental_app.db");
  const restoredUploads = path.join(extractPath, "uploads");

  const database = openReadOnly(restoredDatabase);
  let restoredCounts;
  let restoredVersion;
  let restoredIntegrity;

  try {
    restoredVersion = readSchemaVersion(database);
    restoredCounts = readTableCounts(database);
    restoredIntegrity = readIntegrity(database);
  } finally {
    database.close();
  }

  const restoredUploadHashes = hashUploads(restoredUploads);

  return {
    found: true,
    archivePath,
    archiveName: path.basename(archivePath),
    backupType: metadata.backupType,
    appVersion: metadata.appVersion,
    sourceSchemaVersion: metadata.sourceSchemaVersion,
    targetSchemaVersion: metadata.targetSchemaVersion,
    restoredSchemaVersion: restoredVersion,
    restoredIntegrity: restoredIntegrity.integrityCheck,
    restoredForeignKeyViolations: restoredIntegrity.foreignKeyViolations,
    countsMatch:
      JSON.stringify(withoutAppSettings(restoredCounts)) ===
      JSON.stringify(withoutAppSettings(before.tableCounts)),
    uploadsMatch:
      JSON.stringify(restoredUploadHashes) === JSON.stringify(before.uploads),
    restoredUploads: restoredUploadHashes.length,
  };
}

/**
 * Copies exactly the three artifacts a release publishes. Anything else in
 * `release/` — the unpacked directory, builder debug output — stays out of the
 * rehearsal, so each path uses exactly what a real client would receive.
 */
function copyReleaseArtifacts(releasePath, feedPath, version) {
  const installer = `ARAK-Rental-Desk-Setup-${version}.exe`;
  const names = [installer, `${installer}.blockmap`, "latest.yml"];

  for (const name of names) {
    const source = path.join(releasePath, name);

    if (!fs.existsSync(source)) {
      throw new Error(
        `${name} is missing from ${releasePath}. Run \`npm run dist\` before the rehearsal.`,
      );
    }

    fs.copyFileSync(source, path.join(feedPath, name));
  }

  const latest = fs.readFileSync(path.join(feedPath, "latest.yml"), "utf8");
  const advertised = readYamlScalar(latest, "version");

  if (advertised !== version) {
    throw new Error(
      `latest.yml advertises ${advertised} but package.json says ${version}`,
    );
  }

  return { names };
}

function withoutAppSettings(counts) {
  // The migration rewrites the schema version row, so this one table is
  // expected to differ and is compared separately.
  const rest = { ...counts };
  delete rest.app_settings;

  return rest;
}

function countFiles(directory) {
  return fs.existsSync(directory) ? fs.readdirSync(directory).length : 0;
}

/** Paths only; never the contents of anything the guard looked at. */
function redactProbe(probe) {
  return {
    platform: probe.platform,
    isGithubHostedRunner: probe.isGithubHostedRunner,
    isWindowsSandbox: probe.isWindowsSandbox,
    hasDisposableMarkerFile: probe.hasDisposableMarkerFile,
  };
}

function truncate(text, limit = 200) {
  return text && text.length > limit ? `${text.slice(0, limit)}...` : text;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("");
    console.error("--- upgrade rehearsal failed ---");
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
