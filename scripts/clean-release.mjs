import fs from "node:fs";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.resolve(rootDir, "release");
const relative = path.relative(rootDir, releaseDir);

if (relative !== "release" || relative.startsWith("..") || path.isAbsolute(relative)) {
  throw new Error(`Refusing to remove unexpected release path: ${releaseDir}`);
}

fs.rmSync(releaseDir, { recursive: true, force: true });
stdout.write(`Cleaned ${releaseDir}\n`);
