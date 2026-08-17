import type { RentalAppApi } from "../../electron/types";

/**
 * The renderer's single door to the main process.
 *
 * Preload already validates channels, applies the IPC permission policy and
 * normalizes thrown errors into messages the UI can show. Anything added here
 * would be a second, invisible layer doing the same job, so this file only
 * names the bridge and types it — no try/catch, no defaults, no reshaping.
 *
 * Everything under `src/` goes through this. A source guard enforces that, which
 * is what makes the data layer's rules — session epochs, cache invalidation,
 * command classification — impossible to bypass by reaching for the global.
 */
export const rentalAppApi: RentalAppApi = window.rentalApp;

/**
 * The updates channel is optional on the bridge: a development renderer running
 * outside a packaged build has no updater attached. Callers that need it get
 * `undefined` rather than a crash, exactly as before.
 */
export function getUpdatesApi(): RentalAppApi["updates"] {
  return rentalAppApi?.updates;
}

/**
 * Whether the preload bridge is attached at all.
 *
 * Opened in a plain browser there is no bridge, and every screen below would
 * fail on its first call. The shell asks this so it can say so instead. It is
 * answered from the adapter's own binding rather than by reading the global a
 * second time, because naming the global anywhere else — including for a mere
 * existence check — is what the source guard forbids.
 */
export function isDesktopBridgeAvailable(): boolean {
  return Boolean(rentalAppApi);
}
