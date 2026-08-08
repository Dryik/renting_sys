/**
 * Runs the renderer smoke check and prints its report.
 *
 * The Electron process writes to a file rather than to stdout: on Windows a
 * main process that writes to a piped stdout can fail to exit after
 * `app.exit()`, which turns a passing run into a hang. Writing to a file and
 * printing it from here keeps `npm run smoke:renderer` a single command that
 * always terminates.
 *
 * Usage:
 *   npm run build && npm run smoke:renderer
 *
 * Exits with the smoke run's own exit code.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = path.join(repositoryPath, "scripts", "renderer-smoke.cjs");
const reportPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "renderer-smoke-")),
  "report.txt",
);

if (!fs.existsSync(path.join(repositoryPath, "out", "main", "index.js"))) {
  console.error("The built app is missing. Run `npm run build` first.");
  process.exit(1);
}

const electronBinary = path.join(
  repositoryPath,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

const child = spawn(electronBinary, [entryPath], {
  env: { ...process.env, SMOKE_OUTPUT: reportPath, SMOKE_REPO: repositoryPath },
  stdio: "ignore",
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  if (fs.existsSync(reportPath)) {
    process.stdout.write(fs.readFileSync(reportPath, "utf8"));
  } else {
    console.error("The smoke run produced no report.");
  }

  fs.rmSync(path.dirname(reportPath), { recursive: true, force: true });
  process.exit(code ?? 1);
});
