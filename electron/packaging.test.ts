import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("packaging guardrails", () => {
  it("does not package internal license generator tooling", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      build?: { files?: string[] };
    };

    expect(packageJson.build?.files).toEqual(["out/**/*", "package.json"]);
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
