import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releasePath = path.join(repositoryPath, "release");
const stagingPath = path.join(releasePath, "cleanup-v0.3.9-staging");
const builderCachePath = path.join(releasePath, ".electron-builder-cache");
const runtimePackages = [
  "adm-zip",
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
];

assertGeneratedPathIsSafe(stagingPath);
fs.rmSync(stagingPath, { recursive: true, force: true });
fs.mkdirSync(path.join(stagingPath, "scripts"), { recursive: true });
fs.mkdirSync(path.join(stagingPath, "build"), { recursive: true });

for (const fileName of ["cleanup-v0.3.9-app.cjs", "cleanup-v0.3.9.mjs"]) {
  fs.copyFileSync(
    path.join(repositoryPath, "scripts", fileName),
    path.join(stagingPath, "scripts", fileName),
  );
}

for (const packageName of runtimePackages) {
  const sourcePath = path.join(repositoryPath, "node_modules", packageName);
  const destinationPath = path.join(stagingPath, "node_modules", packageName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Required runtime package is missing: ${packageName}`);
  }
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

fs.copyFileSync(
  path.join(repositoryPath, "build", "icon.ico"),
  path.join(stagingPath, "build", "icon.ico"),
);

// The prebuild installer is only needed while installing better-sqlite3. The
// portable helper ships the already-built Electron native binding, so keeping
// that installer dependency would unnecessarily enlarge (and complicate) the
// one-file cleanup utility.
const betterSqlitePackagePath = path.join(
  stagingPath,
  "node_modules",
  "better-sqlite3",
  "package.json",
);
const betterSqlitePackage = JSON.parse(
  fs.readFileSync(betterSqlitePackagePath, "utf8"),
);
delete betterSqlitePackage.dependencies["prebuild-install"];
fs.writeFileSync(
  betterSqlitePackagePath,
  `${JSON.stringify(betterSqlitePackage, null, 2)}\n`,
  "utf8",
);

const nativeBindingPath = path.join(
  stagingPath,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
if (!fs.existsSync(nativeBindingPath)) {
  throw new Error("The Electron better-sqlite3 native binding is missing. Run npm install first.");
}

fs.writeFileSync(
  path.join(stagingPath, "package.json"),
  JSON.stringify(
    {
      name: "arak-v039-data-cleanup",
      version: "1.0.0",
      description: "One-time guarded cleanup helper for Rental Desk v0.3.9",
      author: "ARAK Communication & IT Services",
      private: true,
      main: "scripts/cleanup-v0.3.9-app.cjs",
      packageManager: "traversal@1.0.0",
      dependencies: {
        "adm-zip": "0.6.0",
        "better-sqlite3": "12.10.0",
      },
    },
    null,
    2,
  ),
  "utf8",
);

const builderCliPath = path.join(
  repositoryPath,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js",
);
const child = spawn(
  process.execPath,
  [
    builderCliPath,
    "--config",
    path.join(repositoryPath, "electron-builder.cleanup-v0.3.9.yml"),
    "--projectDir",
    stagingPath,
    "--win",
    "portable",
    "--x64",
  ],
  {
    cwd: repositoryPath,
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: builderCachePath,
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

function assertGeneratedPathIsSafe(targetPath) {
  const relative = path.relative(releasePath, path.resolve(targetPath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to prepare a cleanup app outside the release directory.");
  }
}
