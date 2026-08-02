# Contract Printing Reliability Report — v0.3.2

Date: 2026-08-02

Implementation commit: `ca3ee22`

Starting point: `6065efa` (`v0.3.1`)

## Purpose

This report records the contract-printing reliability work completed for v0.3.2. It is intended for maintainers and future AI agents who need to understand the problem, the decisions made, the verification performed, and the constraints that must be preserved.

The reported issue was that rental contracts did not print consistently on different Windows machines and printer configurations. The objective was to make saved PDFs and physical prints use the same deterministic A4 document instead of allowing each printer driver to reinterpret the original HTML independently.

## Problems Found

The previous implementation had several independent sources of variation and failure:

1. Physical printing sent HTML directly to the operating-system print path without first fixing the page geometry in a PDF.
2. A4 paper size and margins were not consistently enforced at every stage.
3. The asynchronous Electron print callback was not awaited, so the application could report completion or destroy resources before the printer spooler had accepted the job.
4. Print failures were written to the console but were not reliably returned to the user interface.
5. Contract HTML referenced machine-installed fonts. Arabic layout could therefore vary with the fonts installed on each computer.
6. Several generated contract sections existed as variables but were not inserted into the final document.
7. Motorcycle-specific classes and layout rules were incomplete, creating a risk of missing or clipped content.
8. Long HTML documents were initially unsuitable for a `data:` URL because embedded fonts and images made the URL too large.
9. Windows short temporary paths and delayed file locks could break loading or cleanup of temporary print files.
10. There was no focused production-path PDF smoke test or page-by-page visual verification workflow.

## Solution Architecture

The new pipeline is:

```text
Rental data + shop settings
        |
        v
Pure contract HTML renderer
        |
        v
Chromium A4 PDF renderer
        |
        +--------------------+
        |                    |
        v                    v
Save the PDF           Load the same PDF
to a chosen path       into the system print dialog
```

The important invariant is that export and physical printing start from the same PDF bytes. The printer driver no longer lays out the original contract HTML.

## Implementation Details

### Canonical contract renderer

`electron/db/rental-contract-document.ts` now owns contract document construction as a pure renderer.

It provides:

- one A4 portrait page definition with 10 mm margins;
- embedded Cairo Latin and Arabic font resources;
- deterministic black-and-white-friendly styling;
- Arabic, English, and bilingual label resolution;
- customer and vehicle details;
- rental dates, pricing, deposits, paid and remaining amounts;
- handover and return information;
- assigned accessories and charges;
- held or returned collateral items;
- customer and shop signature areas;
- standard or shop-configured contract terms;
- motorcycle-specific detailed terms;
- an embedded motorcycle condition diagram and handover checklist;
- natural multi-page flow without clipping or a fixed page-count assumption.

Contract data is HTML-escaped before interpolation. Direction-sensitive values such as identifiers, plate numbers, phone numbers, and money are isolated as left-to-right values inside Arabic documents.

### PDF generation

`electron/printing/pdf-renderer.ts` converts the rendered HTML into the canonical PDF using Electron's Chromium renderer.

The implementation deliberately uses a temporary local HTML file rather than a `data:` URL. Complex motorcycle contracts embed enough font and image data to exceed reliable URL sizes.

Windows reliability measures include:

- resolving the system temporary directory to its full native path, avoiding short-path URLs such as `ADMINI~1`;
- loading with `BrowserWindow.loadFile`;
- waiting for `document.fonts.ready` and all images before generating the PDF;
- navigating the hidden render window away from the temporary file before destroying it;
- retrying temporary-file deletion when Windows briefly retains a file lock.

### Physical print and PDF export orchestration

`electron/db/print.service.ts` now renders the canonical PDF first for both actions.

For PDF export, the exact bytes are written to the path chosen by the user.

For physical printing, the PDF is written to a temporary file, loaded in a hidden PDF-capable Electron window, and sent to the normal Windows print dialog with A4 paper and no additional margins. The callback is awaited with a 120-second timeout. A short spooler grace period remains before the window is destroyed.

The function returns one of three explicit outcomes:

- `printed`
- `saved`, including the selected path
- `cancelled`

Failures throw an error instead of being silently logged.

### User-visible outcomes

`src/features/rentals/RentalsPage.tsx` now displays clear messages when a contract is printed, saved, or cancelled. Old notices are cleared when a different contract panel or print action is opened.

The shared API contract lives in `src/shared/printing.ts` and is exposed through `electron/types.ts`.

### Diagnostics and privacy

Print events are appended as JSON lines to Electron's application logs directory in `printing.jsonl`.

Recorded fields include:

- timestamp;
- document type;
- outcome and failure reason;
- application and Electron versions;
- operating system version;
- packaged/development state;
- configured A4 page size.

The diagnostics intentionally exclude contract numbers, customer names, phone numbers, plate numbers, and other business data.

### Production-path smoke test

`electron/contract-print-smoke.ts` creates synthetic English car and Arabic motorcycle fixtures and sends both through the production HTML and PDF renderers. No production database or customer data is accessed.

Run it with:

```powershell
$env:RENTAL_PRINT_QA_OUTPUT_DIR = "C:\path\to\qa-output"
npm run qa:contract-print
```

The smoke entry is included as a separate Electron Vite main-process entry. It is test tooling only and is not called by the normal application startup path.

## Files Changed and Why

| File | Reason |
| --- | --- |
| `electron/db/rental-contract-document.ts` | Pure, deterministic contract HTML renderer and A4 print CSS. |
| `electron/printing/pdf-renderer.ts` | Shared HTML-to-A4-PDF implementation with Windows-safe resource handling. |
| `electron/db/print.service.ts` | PDF-first save/print orchestration, awaited print result, cleanup, and diagnostics. |
| `electron/db/rental-contract-document.test.ts` | Focused renderer, language, content, and self-contained-resource tests. |
| `electron/contract-print-smoke.ts` | Production-path car and motorcycle PDF fixtures. |
| `electron.vite.config.ts` | Builds the standalone contract print smoke entry. |
| `electron/assets.d.ts` | Types inline WOFF2 font imports used by the main-process renderer. |
| `src/shared/printing.ts` | Shared explicit result type for print actions. |
| `electron/types.ts` | Updates the preload-facing rental print API result. |
| `src/features/rentals/RentalsPage.tsx` | Displays printed, saved, cancelled, and failure outcomes. |
| `src/shared/i18n.ts` | Completes Arabic labels used by the contract, terms, tables, and signatures. |
| `package.json` | Adds the print QA command and bumps the release to v0.3.2. |
| `package-lock.json` | Aligns root package metadata with v0.3.2. |

## Verification Evidence

The following checks were completed on Windows 11:

- TypeScript typecheck passed.
- Focused ESLint checks passed for every changed source file.
- Contract renderer tests passed: 4 of 4.
- Production build passed.
- The desktop app started with an isolated temporary user-data directory.
- The renderer reported its preload API as available and rendered the first-use screen.
- The production print smoke generated both fixtures successfully.
- PDF metadata confirmed both fixtures were A4: `594.96 x 841.92 points`.
- The English car fixture produced 3 pages.
- The Arabic motorcycle fixture produced 5 pages.
- All 8 generated PDF pages were rendered to PNG and visually inspected.
- No clipped headings, broken Arabic shaping, missing sections, missing diagram, or page-edge overflow remained after correction.

Repository-wide baseline checks also found:

- Full tests: 126 passed and 1 failed.
- The remaining failure is the pre-existing packaging guardrail test, which expects the package file list to omit `build/**/*`; the existing release configuration intentionally includes `build/**/*` for icons and installer resources.
- Full lint reports 40 pre-existing errors in unrelated files and legacy scripts. Focused lint for all files changed by this work is clean.

## Release and Operational Notes

- This change does not alter the SQLite schema or business data.
- Temporary print files are stored under the operating-system temporary directory, not the project or production data directory.
- Generated QA fixtures use invented values only.
- No dependency was added.
- A real physical printer was not available during implementation. The Windows system dialog path is implemented and exercised up to PDF generation/loading, but final acceptance should include one printed car contract and one printed motorcycle contract on representative client printers.
- Page count is content-dependent. Do not reintroduce assumptions that every contract must contain exactly three pages.

## Guardrails for Future Changes

Future agents modifying contract printing should preserve these rules:

1. Keep PDF export and physical printing on the same canonical PDF pipeline.
2. Do not send the contract HTML directly to a printer driver.
3. Keep A4 geometry explicit in both CSS and Electron print options.
4. Keep required fonts and diagrams self-contained; do not add network resources.
5. Keep database access out of the pure document renderer.
6. Escape all business data before inserting it into HTML.
7. Never add customer or contract identifiers to print diagnostics.
8. Await the Electron print callback and retain the spooler grace period.
9. Preserve Windows full-path resolution and temporary-file cleanup retries.
10. Run `npm run qa:contract-print`, inspect PDF metadata, and visually review every generated page after layout changes.
11. Test Arabic and English, plus both car and motorcycle contract paths.
12. Treat saved PDF output as the reference artifact when investigating a printer-specific result.

## Recommended On-Site Acceptance Check

On each representative client machine:

1. Open an existing car rental and save its contract as PDF.
2. Print the same contract through the Windows print dialog.
3. Confirm A4 is selected, all page edges are visible, and the print matches the saved PDF.
4. Repeat with a motorcycle rental containing accessories and the condition diagram.
5. Cancel one print dialog and confirm the app reports cancellation rather than success.
6. If a driver fails, collect `printing.jsonl` from the app logs directory without sharing the customer contract itself.
