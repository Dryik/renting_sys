# Offline Licensing

ARAK Rental Desk uses a simple offline license plus a local 15-day trial. This prevents casual copying only; it is not strong DRM.

## Runtime Behavior

- A valid paid license unlocks full use.
- Without a paid license, the app creates a 15-day trial on first launch.
- While the trial is active, write actions are allowed.
- After the trial expires, the app is read-only. Staff can still log in, view data, print/export reports, export backups, export a license request, and import a license file.
- Backup restore and all business edits require write access.
- A user who is required to change their own PIN can still complete that self-service change in read-only mode. General user management remains blocked.
- Read-only licensing blocks business mutations. Local maintenance writes such as license import, trial `lastSeenAt`, current-user PIN change, report export audit entries, and backup export metadata may still occur.

License and trial files live in Electron `app.getPath("userData")`:

- `license.json`
- `trial.json`
- `trial-issued.json`

They are not stored in SQLite, not stored under `uploads`, and not included in normal business backup ZIPs. `trial-issued.json` is a small HMAC-protected marker that records that a trial was already issued for the hashed machine code. Deleting `trial.json` alone does not reset the trial; if the marker remains, the app enters read-only mode instead of creating a fresh trial. This is still anti-casual-copying only, not strong DRM against someone who deletes all app data.

If Windows MachineGuid cannot be read, the app returns a read-only `machine-code-unavailable` status. It does not create a trial, export a license request, or accept a license import until the machine code can be read. The license screen shows a recoverable support message instead of leaving the app stuck on loading.

## Issuing A License

1. On the client PC, open **App License**.
2. Click **Export License Request**.
3. Move the request JSON to the private ARAK licensing machine.
4. Generate a signed license:

```bash
node scripts/generate-license.mjs \
  --request C:\path\to\arak_license_request.json \
  --private-key C:\secure\arak-license-key-2026-01.private.pem \
  --license-id LIC-001 \
  --customer "Customer Name" \
  --out C:\path\to\license.json
```

5. On the client PC, open **App License** and click **Import License File**.

## Key Management

Generate a keypair on a private machine, not inside the repo:

```bash
node scripts/generate-license-keypair.mjs --out-dir C:\secure\arak-license-keys
```

Keep the private key outside:

- this repo
- the app bundle
- client machines
- source maps
- installers

The repo `.gitignore` excludes common private key folders and file extensions such as `license-keys/`, `private-keys/`, `secrets/`, `*.private.pem`, `*.private.key`, `*.key`, `*.p8`, `*.p12`, and `*.pfx`. Keep production key material outside the repo even with these guardrails.

Copy only the public key into `electron/licensing/public-keys.ts` and build the installer after that. If the private key is lost, issue future builds with a new `keyId` and public key.

The Electron Builder package includes only `out/**/*` and `package.json`; the internal license generator scripts and docs are not bundled into the installer. Do not copy generated private keys or license tooling into `out/` before packaging.

Normal backup ZIPs include only the SQLite database, backup metadata, and allowed uploaded business files. Backup export and restore validation recursively exclude `license.json`, `trial.json`, `trial-issued.json`, private key material, source maps, and obvious secret/signing-key paths, even if those files appear under `uploads`.

## Reissue Process

Reissue a license when a client replaces or reinstalls Windows on the PC:

1. Ask the client to export a new license request from the new Windows install.
2. Generate a new license for the new machine code.
3. Keep the old license record in your sales/support notes.

Do not ask clients to send raw Windows MachineGuid values. The app only shows and exports the hashed machine code.
