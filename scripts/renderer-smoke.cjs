/**
 * Renderer smoke run against the built application.
 *
 * Loads the real built renderer with the real preload bridge in a throwaway
 * user-data directory, then asserts from inside the page. It never opens the
 * live application data directory: `RENTAL_APP_USER_DATA_DIR` is pointed at a
 * fresh temp folder before the main process is required.
 *
 * Run it with:
 *
 *   npm run build
 *   npm run smoke:renderer
 *
 * Exits 0 when every check passes, 1 otherwise.
 *
 * The report goes to the file named by `SMOKE_OUTPUT`, which the wrapper always
 * provides. It is deliberately not written to stdout: an Electron main process
 * with a piped stdout can fail to exit after `app.exit()` on Windows, which
 * turns a passing run into a hang. The wrapper prints the file instead.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const repositoryPath = process.env.SMOKE_REPO || path.resolve(__dirname, "..");
const outputPath = process.env.SMOKE_OUTPUT;
const lines = [];

if (!outputPath) {
  // Fail loudly rather than writing nowhere; run this through the wrapper.
  console.error("SMOKE_OUTPUT is required. Run `npm run smoke:renderer`.");
  app.exit(1);
}

function log(line) {
  lines.push(line);
  fs.writeFileSync(outputPath, lines.join("\n") + "\n");
}

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(52)} ${JSON.stringify(actual)}`);

  return ok;
}

async function main() {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "pr5-smoke-"));
  process.env.RENTAL_APP_USER_DATA_DIR = workspacePath;
  fs.mkdirSync(path.join(workspacePath, "uploads"), { recursive: true });

  // The built main process wires every IPC handler and opens the database.
  require(path.join(repositoryPath, "out", "main", "index.js"));

  await app.whenReady();
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const [window] = BrowserWindow.getAllWindows();

  if (!window) {
    log("SMOKE FAILURE: the built app opened no window");
    app.exit(1);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const page = window.webContents;

  log("--- built renderer ---");

  const hasApi = await page.executeJavaScript(
    "Boolean(window.rentalApp && typeof window.rentalApp.auth.getState === 'function')",
  );
  check("hasApi", hasApi, true);

  const channels = await page.executeJavaScript(
    "Object.keys(window.rentalApp).sort().join(',')",
  );
  log(`  info  bridge namespaces: ${channels}`);

  // Arabic is the default language, and the shell must be right-to-left.
  const lang = await page.executeJavaScript("document.documentElement.lang");
  const dir = await page.executeJavaScript("document.documentElement.dir");
  check("default language is Arabic", lang, "ar");
  check("document direction is RTL", dir, "rtl");

  const bodyText = await page.executeJavaScript("document.body.innerText.slice(0, 400)");
  log(`  info  first screen text: ${JSON.stringify(bodyText.replace(/\s+/g, " ").trim().slice(0, 160))}`);

  // The renderer reached the main process for real data, not a stub.
  const authState = await page.executeJavaScript(
    "window.rentalApp.auth.getState().then((s) => JSON.stringify({ needsOwnerSetup: s.needsOwnerSetup, isAuthenticated: s.isAuthenticated }))",
  );
  log(`  info  auth state over IPC: ${authState}`);

  // A browser "offline" event must not pause anything: the database is local.
  const offlineResult = await page.executeJavaScript(`
    (async () => {
      window.dispatchEvent(new Event("offline"));
      const before = navigator.onLine;
      const settings = await window.rentalApp.settings.get();
      return JSON.stringify({
        dispatched: true,
        navigatorOnLine: before,
        settingsResolved: Boolean(settings && settings.language),
      });
    })()
  `);
  log(`  info  offline probe: ${offlineResult}`);
  check(
    "IPC still resolves after an offline event",
    JSON.parse(offlineResult).settingsResolved,
    true,
  );

  // Owner setup, then a signed-in shell, exercised through the real bridge.
  const setupResult = await page.executeJavaScript(`
    window.rentalApp.auth.setupOwner({
      fullName: "Smoke Owner",
      username: "smokeowner",
      password: "1234",
      confirmPassword: "1234",
    }).then((s) => JSON.stringify({ isAuthenticated: s.isAuthenticated, user: s.currentUser && s.currentUser.username }))
  `);
  log(`  info  owner setup: ${setupResult}`);
  check("owner setup authenticates", JSON.parse(setupResult).isAuthenticated, true);

  // A business write, then a read that must reflect it.
  const writeResult = await page.executeJavaScript(`
    (async () => {
      const vehicle = await window.rentalApp.vehicles.create({
        type: "car", brand: "Toyota", model: "Corolla", plateNumber: "SMOKE-PR5",
        chassisNumber: null, color: "White", year: 2020,
        dailyPrice: 1.005, depositAmount: 2.675, status: "available",
        mileage: 1000, insuranceExpiryDate: null, registrationExpiryDate: null,
        technicalInspectionExpiryDate: null, lastOilChangeDate: null,
        lastOilChangeMileage: null, notes: null, commissionRateOverride: null,
      });
      const listed = await window.rentalApp.vehicles.list({ page: 1, search: "SMOKE-PR5" });
      const row = listed.rows[0];
      return JSON.stringify({
        dailyPrice: row.dailyPrice,
        depositAmount: row.depositAmount,
        internalKeys: Object.keys(row).filter((k) => k.endsWith("Minor") || k.endsWith("Legacy")),
        createdId: vehicle.id,
      });
    })()
  `);
  log(`  info  vehicle round trip: ${writeResult}`);
  const write = JSON.parse(writeResult);
  check("major units on the wire", [write.dailyPrice, write.depositAmount], [1.01, 2.68]);
  check("no internal money keys in the DTO", write.internalKeys, []);

  // Switching to English must change what the renderer reads back.
  const languageResult = await page.executeJavaScript(`
    (async () => {
      await window.rentalApp.settings.save({ language: "en", reason: "smoke" });
      const settings = await window.rentalApp.settings.get();
      return JSON.stringify({ language: settings.language });
    })()
  `);
  log(`  info  language switch: ${languageResult}`);
  check("settings switch to English", JSON.parse(languageResult).language, "en");

  // This harness saved the setting straight over the bridge, which the React
  // tree never sees — in the app the Settings form publishes the result into
  // the shared settings cache, and every consumer re-renders from it. What can
  // be checked from here is that a fresh mount reads the stored value, so the
  // window is reloaded rather than pretending the console write reached React.
  page.reload();
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const dirAfter = await page.executeJavaScript("document.documentElement.dir");
  const langAfter = await page.executeJavaScript("document.documentElement.lang");
  check("shell renders LTR English after reload", [langAfter, dirAfter], ["en", "ltr"]);

  const englishText = await page.executeJavaScript(
    "document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 120)",
  );
  log(`  info  English screen text: ${JSON.stringify(englishText)}`);

  // The five object-valued debounce call sites all live on pages reached from
  // the sidebar, so the loop probe has to actually open one. Accounting is the
  // worst case: nine fields, previously rebuilt as a fresh literal per render.
  const navigation = await page.executeJavaScript(`
    (async () => {
      const opened = [];
      for (const label of ["Accounting", "Activity Log", "Payments"]) {
        const button = Array.from(document.querySelectorAll("button, a"))
          .find((el) => el.textContent && el.textContent.trim() === label);
        if (button) { button.click(); opened.push(label); await new Promise((r) => setTimeout(r, 900)); }
      }
      return JSON.stringify({ opened, heading: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 90) });
    })()
  `);
  log(`  info  navigation probe: ${navigation}`);
  // Without this the idle measurement is meaningless: a failed click would
  // leave the probe on a page that never had an object-valued debounce, and
  // zero mutations would prove nothing.
  check(
    "the Accounting page actually opened before measuring",
    JSON.parse(navigation).opened.includes("Accounting"),
    true,
  );

  // A settled page repaints only when something changes. The 150 ms debounce
  // loop drove a steady stream of DOM mutations; count them directly.
  const mutationProbe = await page.executeJavaScript(`
    (async () => {
      let count = 0;
      const observer = new MutationObserver((records) => { count += records.length; });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      await new Promise((r) => setTimeout(r, 3000));
      observer.disconnect();
      return count;
    })()
  `);
  log(`  info  DOM mutations over 3s idle on the opened page: ${mutationProbe}`);
  check("the idle page is not re-rendering in a loop", mutationProbe < 60, true);

  // Logging out must leave nothing of the previous session readable.
  const logoutResult = await page.executeJavaScript(`
    window.rentalApp.auth.logout().then((s) => JSON.stringify({ isAuthenticated: s.isAuthenticated }))
  `);
  log(`  info  logout: ${logoutResult}`);
  check("logout deauthenticates", JSON.parse(logoutResult).isAuthenticated, false);

  // Again driven over the bridge, so React was not told. Reloading proves the
  // main process really dropped the session and the shell starts at login.
  // Whether the *renderer* discards cached rows on logout is not observable
  // from a console write — the session-transition unit tests cover that.
  page.reload();
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const afterLogoutText = await page.executeJavaScript(
    "document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 200)",
  );
  log(`  info  screen after logout + reload: ${JSON.stringify(afterLogoutText)}`);
  check("logged-out shell shows the login screen", afterLogoutText.includes("Login"), true);
  check(
    "no previous-user record on the logged-out screen",
    afterLogoutText.includes("SMOKE-PR5"),
    false,
  );

  const failures = lines.filter((line) => line.includes("FAIL")).length;
  log(`--- ${failures === 0 ? "all checks passed" : failures + " CHECK(S) FAILED"} ---`);

  // The database is still open; the OS reclaims the temp directory.
  try {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  } catch {
    log(`  info  temp workspace left for the OS to reclaim: ${workspacePath}`);
  }

  app.exit(failures === 0 ? 0 : 1);
}

app.whenReady().then(() =>
  main().catch((error) => {
    log(`SMOKE FAILURE: ${error && error.stack ? error.stack : String(error)}`);
    app.exit(1);
  }),
);
