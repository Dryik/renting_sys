/**
 * Timeouts for the test suites that drive real SQLite files.
 *
 * Test-only. Nothing in `electron/` or `src/` imports this, and it is not
 * reachable from any build entry point.
 *
 * Vitest's 5 second default is right for pure functions and wrong for these:
 * a migration test writes a database to disk, runs the whole ladder, takes a
 * verified ZIP backup and reads it back. On a developer's NVMe that lands
 * comfortably inside a second; on a GitHub-hosted Windows runner the same work
 * took 8 to 25 seconds and 38 tests failed on the clock alone, with no
 * assertion failures among them.
 *
 * The number is a ceiling for a stuck test, not a target. It is applied per
 * suite through Vitest's suite options — `describe(name, { timeout }, fn)` —
 * so it reaches exactly the suites that touch the filesystem and leaves every
 * other test on the default. Raising the global timeout instead would let a
 * genuinely hung unit test sit for half a minute before reporting.
 */
export const DB_INTEGRATION_TEST_TIMEOUT_MS = 30_000;
