import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { moneyColumnPairs } from "./money-columns";

/**
 * Source-level guards for the rules that no type or test can enforce.
 *
 * Minor units are only the source of truth if nothing quietly reads a legacy
 * REAL column again. The Drizzle `*Legacy` naming makes an accidental read
 * visible; these tests make it fail.
 */
const repositoryPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const electronDbPath = path.join(repositoryPath, "electron", "db");
const sharedPath = path.join(repositoryPath, "src", "shared");

/** Files allowed to mention a legacy column: schema, migration, triggers,
 * compatibility writes, frozen fixtures and the tests that check them. */
const legacyAwareFiles = new Set([
  "schema.ts",
  "table-ddl.ts",
  "migrations.ts",
  "money-columns.ts",
  "money-write.ts",
]);

function readSourceFiles(directory: string): Array<{ name: string; text: string }> {
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({
      name,
      text: fs.readFileSync(path.join(directory, name), "utf8"),
    }));
}

const serviceFiles = readSourceFiles(electronDbPath);
const sharedFiles = readSourceFiles(sharedPath);

describe("SQL never aggregates or compares a legacy money column", () => {
  const legacyColumns = [...new Set(moneyColumnPairs.map((pair) => pair.legacyColumn))];

  it("sums only minor columns", () => {
    const offenders: string[] = [];

    for (const file of serviceFiles) {
      for (const column of legacyColumns) {
        // `sum(amount)` is a violation; `sum(amount_minor)` is not.
        const pattern = new RegExp(`sum\\(\\s*[\\w.]*\\b${column}\\b(?!_minor)`, "i");

        if (pattern.test(file.text)) {
          offenders.push(`${file.name}: sum(${column})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("names no table-qualified legacy column in any SQL", () => {
    // `rentals.deposit_paid` in a query is a violation; `input.cost` in
    // JavaScript is not, because `input` is not one of the tables.
    const offenders: string[] = [];

    for (const file of serviceFiles) {
      if (legacyAwareFiles.has(file.name)) {
        continue;
      }

      for (const pair of moneyColumnPairs) {
        const pattern = new RegExp(
          `\\b${pair.table}\\.${pair.legacyColumn}\\b(?!_minor)`,
        );

        if (pattern.test(file.text)) {
          offenders.push(`${file.name}: ${pair.table}.${pair.legacyColumn}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("selects no bare legacy column in raw SQL", () => {
    const offenders: string[] = [];

    for (const file of serviceFiles) {
      if (legacyAwareFiles.has(file.name)) {
        continue;
      }

      for (const column of legacyColumns) {
        // `deposit_paid as depositPaid` and friends: a snake_case alias only
        // appears when raw SQL is naming a column.
        const pattern = new RegExp(`\\b${column}\\b(?!_minor)\\s+as\\s+`, "i");

        if (pattern.test(file.text)) {
          offenders.push(`${file.name}: select ${column}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("services read the minor column, never the mirror", () => {
  it("mentions no Drizzle *Legacy property outside the files that define them", () => {
    const offenders: string[] = [];

    for (const file of [...serviceFiles, ...sharedFiles]) {
      if (legacyAwareFiles.has(file.name)) {
        continue;
      }

      const matches = file.text.match(/\b\w+Legacy\b/g);

      if (matches) {
        offenders.push(`${file.name}: ${[...new Set(matches)].join(", ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("declares a Legacy and a Minor property for all 30 pairs in the schema", () => {
    const schema = fs.readFileSync(path.join(electronDbPath, "schema.ts"), "utf8");

    for (const pair of moneyColumnPairs) {
      expect(schema).toContain(`real("${pair.legacyColumn}")`);
      expect(schema).toContain(`integer("${pair.minorColumn}")`);
    }

    expect(schema.match(/Legacy: real\(/g)).toHaveLength(30);
  });
});

describe("one rounding rule", () => {
  it("defines roundMoney only in the shared money module", () => {
    const definitions: string[] = [];

    for (const file of [...serviceFiles, ...sharedFiles]) {
      if (/^(export )?function roundMoney\b/m.test(file.text)) {
        definitions.push(file.name);
      }
    }

    expect(definitions).toEqual(["money.ts"]);
  });

  it("leaves no private Math.round money rounding behind", () => {
    const offenders: string[] = [];

    for (const file of [...serviceFiles, ...sharedFiles]) {
      if (/Math\.round\([^)]*\*\s*100\)/.test(file.text)) {
        offenders.push(file.name);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("the public boundary stays in major units", () => {
  it("exposes no *Minor field on a shared DTO", () => {
    const offenders: string[] = [];

    for (const file of sharedFiles) {
      if (file.name === "money.ts") {
        continue;
      }

      // A *Minor field is fine on the internal *Minor calculation types, but a
      // record or list DTO must not carry one.
      for (const match of file.text.matchAll(
        /export type (\w+(?:Record|ListRecord|Summary|Totals))\b[\s\S]*?\n};/g,
      )) {
        if (/\w+Minor\??:/.test(match[0]) && !match[1]!.endsWith("Minor")) {
          offenders.push(`${file.name}: ${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the preload channel surface unchanged", () => {
    const preload = fs.readFileSync(
      path.join(repositoryPath, "electron", "preload.ts"),
      "utf8",
    );

    expect(preload).not.toContain("Minor");
    expect(preload).not.toContain("minor");
  });

  it("declares no minor unit in the renderer", () => {
    const rendererFiles = collectFiles(path.join(repositoryPath, "src"), [
      ".ts",
      ".tsx",
    ]).filter((file) => !file.includes(`${path.sep}shared${path.sep}`));
    const offenders = rendererFiles.filter((file) =>
      /\bMoneyMinor\b|\w+Minor\b/.test(fs.readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});

function collectFiles(directory: string, extensions: string[]): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...collectFiles(entryPath, extensions));
      continue;
    }

    if (extensions.some((extension) => entry.name.endsWith(extension))) {
      found.push(entryPath);
    }
  }

  return found;
}
