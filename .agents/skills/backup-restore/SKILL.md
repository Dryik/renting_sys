---
name: backup-restore
description: Use when implementing local backup, restore, database export/import, app data directory, uploaded file storage, and Windows data safety workflows.
---

# Backup and Restore Skill

The app is local-first and must protect business data.

Rules:
- Store production database in Electron app.getPath("userData").
- Store uploaded files under the same app data directory.
- Never store real business data inside the project directory.
- Backup must create one ZIP file.
- Backup ZIP should include:
  - SQLite database
  - uploaded files folder if it exists
  - metadata.json with app version and backup date
- Restore must require confirmation.
- Before restore, create a safety backup of current data.
- Restore should replace database and files only after successful validation.
- Show clear success and error messages.
- Do not add cloud backup in version 1.
