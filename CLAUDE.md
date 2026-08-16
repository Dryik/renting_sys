# Working in this repository

**[`AGENTS.md`](AGENTS.md) is the authoritative guide. Read it before changing
anything.** It holds the product scope, business rules, coding and data-safety
rules, the v0.4.0 architecture and invariants, the upgrade rehearsal's traps,
and the release rules.

It is kept as the single source so that every tool — Claude Code, Codex and the
rest — works from the same instructions. **Put new guidance in `AGENTS.md`, not
here**, or the two will drift and agents will follow different rules.

Supporting documents, all current as of v0.4.0:

| | |
| --- | --- |
| What the product is and is not | [`PROJECT_SCOPE.md`](PROJECT_SCOPE.md) |
| Schema, money invariant, migrations | [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) |
| What is actually outstanding | [`TASKS.md`](TASKS.md) |

## The short version

`v0.4.0` is in front of real shops with real customer data. Assume every change
lands on a machine that cannot afford to lose a rental record.

- The renderer's only backend gateway is `src/data/rental-app-api.ts`. Never
  reach around it.
- Money is integer minor units mirrored beside the original `REAL` columns.
  `legacy === minor / 100` is **false** for historical rows.
- Never hard-delete business records. The audit log is append-only.
- Production data lives in `app.getPath("userData")`, never in the repository.
- The `updater` job in CI fails on purpose. Do not "fix" it. See `TASKS.md`.
- Branch off `main`; do not commit to `main` directly.

## Before trusting a test, make it fail

Three checks in this repository were once green while asserting nothing. Break
the thing on purpose, watch the guard fail, then fix it. If a guard cannot be
made to fail, it is not a guard.

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
