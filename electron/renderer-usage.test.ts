import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source guards for the rules the type system cannot express.
 *
 * The data layer's guarantees — session epochs on every key, invalidation after
 * every write, commands that invalidate nothing — only hold if nothing reaches
 * past it for the global bridge. These tests make that failure visible.
 */
const rendererPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);
const adapterFile = path.join("data", "rental-app-api.ts");

function collectRendererFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...collectRendererFiles(entryPath));
      continue;
    }

    // Application source only: these guards describe what the app does, not
    // what the tests that check it are allowed to mention.
    if (
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts") &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      found.push(entryPath);
    }
  }

  return found;
}

const rendererFiles = collectRendererFiles(rendererPath).map((file) => ({
  name: path.relative(rendererPath, file),
  text: fs.readFileSync(file, "utf8"),
}));

describe("the renderer reaches the main process through one door", () => {
  it("names window.rentalApp only in the adapter", () => {
    const offenders = rendererFiles
      .filter((file) => file.name !== adapterFile)
      .filter((file) => /\bwindow\.rentalApp\b/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it("names it exactly once, there", () => {
    const adapter = rendererFiles.find((file) => file.name === adapterFile);

    expect(adapter?.text.match(/\bwindow\.rentalApp\b/g)).toHaveLength(1);
  });

  it("declares the adapter against the existing bridge type", () => {
    const adapter = rendererFiles.find((file) => file.name === adapterFile);

    // A local re-declaration would let the renderer and the preload contract
    // drift apart without anything failing.
    expect(adapter?.text).toContain("RentalAppApi");
    expect(adapter?.text).toContain('from "../../electron/types"');
  });

  it("does not swallow or reshape errors in the adapter", () => {
    const adapter = rendererFiles.find((file) => file.name === adapterFile);
    // Comments explain the rule; the code has to follow it.
    const code = (adapter?.text ?? "").replace(/\/\*[\s\S]*?\*\//g, "");

    // Preload already normalizes messages; a second layer here would hide them.
    expect(code).not.toContain("catch");
    expect(code).not.toContain("try {");
  });
});

/**
 * `src/shared` is shared with the main process and legitimately holds PR4's
 * minor-unit calculation helpers; its DTOs are guarded separately by
 * `electron/db/money-usage.test.ts`. These checks cover renderer code only,
 * scoped the same way that guard scopes its own renderer rule.
 */
const rendererOnlyFiles = rendererFiles.filter(
  (file) => !file.name.startsWith("shared" + path.sep),
);

describe("the renderer stays in major units", () => {
  it("exposes no internal money field in renderer code", () => {
    // PR4 moved storage onto integer minor units and kept the renderer in major
    // units. No screen may learn the storage names.
    const offenders = rendererOnlyFiles
      .filter((file) => /\bMoneyMinor\b|\b\w+Minor\b|\b\w+Legacy\b/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it("does not round money in the renderer", () => {
    const offenders = rendererOnlyFiles
      .filter((file) => /Math\.round\([^)]*\*\s*100\)/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });
});

describe("debounced values are stable across renders", () => {
  it("is never handed an inline object literal", () => {
    // `useDebouncedValue` compares by identity and writes its input into state.
    // A fresh literal each render restarts the timer, sets state, and renders
    // again — a 150 ms loop with no exit. Callers must memoise instead.
    const offenders = rendererFiles
      .filter((file) => /useDebouncedValue\(\s*\{/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it("is never handed an inline array literal either", () => {
    const offenders = rendererFiles
      .filter((file) => /useDebouncedValue\(\s*\[/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it("memoises every multi-field debounce input", () => {
    // Each caller that debounces more than a bare primitive builds its object
    // through useMemo; this checks the two appear together.
    const callers = rendererFiles.filter((file) =>
      /useDebouncedValue\(\s*filterInput/.test(file.text),
    );

    expect(callers.length).toBeGreaterThan(0);

    for (const caller of callers) {
      expect(
        /const filterInput = useMemo\(/.test(caller.text),
        `${caller.name} debounces filterInput without memoising it`,
      ).toBe(true);
    }
  });
});

describe("cache keys are built in one place", () => {
  it("never opens a form from ensureQueryData", () => {
    // `ensureQueryData` returns a cached entry without checking whether it is
    // still valid, so a form opened with it can offer a vehicle that was rented
    // a moment ago. Screens use `fetchQuery` when freshness matters.
    const offenders = rendererFiles
      .filter((file) => /ensureQueryData\(/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it("keeps hand-written query keys out of individual screens", () => {
    // A literal key would miss the session epoch and outlive a logout. Passing
    // a key that came from the helpers is fine, and is what RentalsPage does.
    const offenders = rendererFiles
      .filter((file) => !file.name.startsWith("data" + path.sep))
      .filter((file) => /queryKey:\s*\[/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });
});
