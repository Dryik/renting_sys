# Tasks

Current release: **v0.4.0**, published from `main`.

> This file used to be a milestone checklist for the original v1 build, with
> every box ticked. It stopped tracking reality several releases ago and was
> rewritten at v0.4.0 to record what is actually outstanding. Completed history
> lives in the git log and in the release notes, not here.

## How work gets done here

1. Branch off `main`. Do not commit to `main` directly.
2. Make the change, with tests for business logic.
3. Run the checks in the "Definition of done" section below.
4. Open a PR.

## Outstanding

### The updater rehearsal never completes

`.github/workflows/upgrade-rehearsal.yml` runs two jobs. `manual-installer`
passes end to end. **`updater` fails, and this is known and understood — do not
"fix" it by weakening the rehearsal or changing the application.**

The job installs v0.3.9, serves the new package from a loopback feed, and
rewrites the installed copy's `resources/app-update.yml` to point at it. The
application ignores the rewrite and consults its original GitHub provider:

```
Checking for update
Update for version 0.3.9 is not available (latest version: 0.3.9, downgrade is disallowed).
```

The feed recorded **zero requests** in fifteen minutes. The redirect is written
to the correct path before the relaunch, and there is no `setFeedURL` in the
application. The next step is to find why the relaunched process does not honour
the rewritten config.

Now that v0.4.0 exists on the real provider, the other half of this can be
checked directly: a v0.3.9 installation pointed at the real GitHub release
should offer and install v0.4.0.

### The v0.3.9 cleanup tool is unmerged

Lives on `cleanup/v0.3.9-data-tool`. It only accepts a schema-11 database, so it
must run on a client machine **before** that machine is upgraded to v0.4.0.
Decide whether it merges to `main` or stays a branch-held utility.

## Definition of done

A change is not finished until all of these pass:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

For anything touching the database, money, backups or the upgrade path, the
upgrade rehearsal must also be considered — it triggers on pull requests that
touch `package.json`, `package-lock.json`, `electron/db/**`,
`scripts/upgrade-rehearsal/**` or the workflow itself.

## A hard-won lesson worth keeping

Three checks in the upgrade rehearsal were reporting success while asserting
nothing: six queries named columns that do not exist and compared an error
against the identical error, three version comparisons read `.version` where the
bridge returns `appVersion`, and one query used `select *` so the migration's own
new columns read as drift.

**Before trusting a new guard, make it fail on the real defect first.** Every
guard added at v0.4.0 was verified that way.
