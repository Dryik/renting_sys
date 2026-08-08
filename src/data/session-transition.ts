import type { QueryClient } from "@tanstack/react-query";

/**
 * Empties the renderer of everything the previous session could see.
 *
 * The order matters. Cancelling first stops requests that are still running, so
 * none of them can write a result into the cache after it is cleared. Clearing
 * both caches drops the rows themselves — including the shop settings object,
 * which carries the owner signature, the logo path and the scheduled backup
 * folder, all readable only with `settings.view`.
 *
 * Advancing the epoch is the part that cannot be undone by a straggler. A
 * request that escaped cancellation still resolves against its old key, and
 * that key belongs to an epoch nothing reads from any more. So even a promise
 * that settles seconds later cannot repopulate the new session.
 *
 * Callers get the new epoch back and must publish it before rendering anything
 * that reads data.
 */
export async function resetRendererSession(
  queryClient: QueryClient,
  currentEpoch: number,
): Promise<number> {
  await queryClient.cancelQueries();
  queryClient.getMutationCache().clear();
  queryClient.clear();

  return currentEpoch + 1;
}
