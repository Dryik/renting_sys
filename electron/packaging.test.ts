import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireFromHere = createRequire(import.meta.url);

describe("SQLite test alias", () => {
  // The tests run against better-sqlite3-node, a dev-only alias of the same
  // package that keeps its Node-ABI build, because electron-builder compiles
  // the production copy for Electron's ABI. If the two ever resolve to
  // different versions the suite silently stops testing what ships.
  it("resolves the same better-sqlite3 version that production ships", () => {
    const production = requireFromHere("better-sqlite3/package.json") as {
      version: string;
    };
    const testAlias = requireFromHere("better-sqlite3-node/package.json") as {
      version: string;
    };

    expect(testAlias.version).toBe(production.version);
  });

  it("pins both to the same exact version so npm cannot drift them apart", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const productionRange = packageJson.dependencies?.["better-sqlite3"];
    const aliasRange = packageJson.devDependencies?.["better-sqlite3-node"];

    expect(productionRange).toMatch(/^\d+\.\d+\.\d+$/);
    expect(aliasRange).toBe(`npm:better-sqlite3@${productionRange}`);
  });
});

describe("packaging guardrails", () => {
  it("packages production runtime and required installer resources only", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      build?: { files?: string[] };
    };

    expect(packageJson.build?.files).toEqual([
      "out/**/*",
      "!out/main/contract-print-smoke.js",
      "build/**/*",
      "package.json",
    ]);
    expect(packageJson.build?.files?.join("\n")).not.toContain("scripts");
    expect(packageJson.build?.files?.join("\n")).not.toContain("docs");
  });

  it("cleans stale release artifacts before packaging without requiring signing", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
      build?: {
        win?: {
          forceCodeSigning?: boolean;
        };
      };
    };

    expect(packageJson.scripts?.dist).toContain("npm run clean:release");
    expect(packageJson.build?.win?.forceCodeSigning).not.toBe(true);
  });
});
