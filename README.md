# ARAK Rental Desk

Local Windows desktop app for small vehicle rental shops. The app manages vehicles, customers, rentals, returns, payments, maintenance, reports, settings, backup/restore, offline licensing, and fleet vehicle sales.

## Tech Stack

- Electron
- React
- TypeScript
- SQLite
- Drizzle ORM
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- Electron Builder

## Development

```bash
npm install
npm run dev
```

## Verification

Run these before committing or creating a release:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Release Build

```bash
npm run dist
```

Installer output is written to `release/`, which is intentionally ignored by Git.

## Data Safety

Runtime data must stay outside the repository. The production SQLite database, uploaded documents, license files, and backups are stored under the Electron app data directory, not inside the project folder.

Private license keys and secrets must never be committed. Public verification keys may be shipped with the app.
