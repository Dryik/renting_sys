/**
 * Every cache key in the renderer is built here.
 *
 * Two rules hold the design together:
 *
 * 1. A key always starts with the session epoch. Cached rows belong to the user
 *    who was signed in when they were fetched, so a lock, a logout, a user
 *    switch or a database restore must not be able to surface them again. The
 *    epoch changes on each of those, which makes every previous key
 *    unreachable rather than merely stale.
 *
 * 2. A key carries every argument that changes the answer — search text, page,
 *    filters, dates, record ids. Anything omitted would let two different
 *    questions share one cached answer.
 *
 * `["renderer", epoch, "business", domain, operation, request]` is the shape.
 * The `business` segment exists so one invalidation can cover every business
 * read after a write, without touching settings, licensing or system state.
 */
export type QueryEpoch = number;

export const rendererKeyRoot = "renderer" as const;
export const businessSegment = "business" as const;
export const settingsSegment = "settings" as const;
export const systemSegment = "system" as const;

/** Everything cached for one session, business or not. */
export function sessionKey(epoch: QueryEpoch) {
  return [rendererKeyRoot, epoch] as const;
}

/**
 * The invalidation target after any business write. Broad on purpose: this app
 * shows one page at a time against a local SQLite file, so refetching a handful
 * of queries costs milliseconds, while a hand-maintained map of which domain
 * invalidates which other domain would be wrong the first time someone adds a
 * cross-domain rule and would fail silently when it was.
 */
export function businessRootKey(epoch: QueryEpoch) {
  return [rendererKeyRoot, epoch, businessSegment] as const;
}

export function settingsRootKey(epoch: QueryEpoch) {
  return [rendererKeyRoot, epoch, settingsSegment] as const;
}

export function systemRootKey(epoch: QueryEpoch) {
  return [rendererKeyRoot, epoch, systemSegment] as const;
}

/**
 * A business read. `request` is whatever the IPC method receives; passing it
 * whole is what guarantees no argument is forgotten, because the key changes
 * whenever the call does.
 *
 * TanStack hashes keys with a stable, key-sorting JSON serializer, so two
 * requests with the same fields in a different order share a cache entry, and
 * `undefined` request and no request agree.
 */
export function businessKey(
  epoch: QueryEpoch,
  domain: string,
  operation: string,
  request?: unknown,
) {
  return request === undefined
    ? ([rendererKeyRoot, epoch, businessSegment, domain, operation] as const)
    : ([rendererKeyRoot, epoch, businessSegment, domain, operation, request] as const);
}

/**
 * Shop settings sit outside the business root: a business write must not
 * refetch them, but a sign-in or a permission change must, and a lock or a
 * logout must drop them. They carry `ownerSignatureDataUrl`, `shopLogoPath` and
 * the scheduled backup folder, which are only readable with `settings.view`.
 */
export function settingsKey(epoch: QueryEpoch) {
  return [rendererKeyRoot, epoch, settingsSegment, "shop"] as const;
}

/**
 * Licensing, diagnostics, app info and update state. Not business data, so a
 * business write leaves them alone.
 */
export function systemKey(epoch: QueryEpoch, operation: string, request?: unknown) {
  return request === undefined
    ? ([rendererKeyRoot, epoch, systemSegment, operation] as const)
    : ([rendererKeyRoot, epoch, systemSegment, operation, request] as const);
}
