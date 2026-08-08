import type { QueryClient } from "@tanstack/react-query";
import type { AuthState } from "@/shared/auth";
import { resetRendererSession } from "./session-transition";

/**
 * What the shell shows once a restore has finished.
 *
 * `restored` means the file was replaced and a fresh unauthenticated state was
 * read back. `restoredStateUnavailable` means the file was replaced but the new
 * state could not be read — the restore itself still succeeded, so it must not
 * be reported as a failure, and the shell must stay signed out either way.
 */
export type RestoreOutcome =
  | { kind: "restored"; authState: AuthState }
  | { kind: "restoredStateUnavailable"; error: Error };

export type RestoreTransitionPorts = {
  queryClient: QueryClient;
  /** Reads the session the main process holds after the swap. */
  getAuthState: () => Promise<AuthState>;
  /** Publishes the new epoch and state to the shell. */
  publish: (state: { epoch: number; authState: AuthState }) => void;
  currentEpoch: () => number;
};

/**
 * A concrete signed-out state, published the moment the caches are cleared.
 *
 * `null` means "the app has not read its state yet" and renders the loading
 * screen — correct at startup, wrong here. Publishing `null` after a restore
 * and then failing to read the real state would leave the app on "Loading…"
 * with no way forward. This state renders the login screen instead, which is
 * both safe and actionable.
 */
export const signedOutAuthState: AuthState = {
  needsOwnerSetup: false,
  isAuthenticated: false,
  isLocked: false,
  currentUser: null,
};

/**
 * Completes a successful restore.
 *
 * The order is the whole point. A restore has already replaced the database
 * underneath the renderer and the main process has already dropped the
 * session, so everything cached belongs to a file that no longer exists. That
 * has to be true of the renderer *before* anything else is attempted:
 *
 * 1. Cancel in-flight queries, empty both caches, advance the epoch.
 * 2. Publish a signed-out state, so the shell is already off the authenticated
 *    screen.
 * 3. Only then ask the main process what the new state is.
 *
 * Reading first and clearing afterwards would mean a failed read leaves the
 * previous user's shell, cache and identity on screen over a database that is
 * no longer theirs. Failing closed here costs one sign-in; failing open shows
 * one customer's records to whoever is sitting in front of the machine.
 */
export async function completeSuccessfulRestore(
  ports: RestoreTransitionPorts,
): Promise<RestoreOutcome> {
  const clearedEpoch = await resetRendererSession(
    ports.queryClient,
    ports.currentEpoch(),
  );

  // Signed out first, unconditionally, and to a concrete state rather than
  // `null` — so if everything below fails the user is looking at the login
  // screen rather than a loading spinner that never resolves.
  ports.publish({ epoch: clearedEpoch, authState: signedOutAuthState });

  try {
    const authState = await ports.getAuthState();

    // A main process that somehow still reports a session is not trusted here:
    // the file it belonged to is gone. The signed-out state already published
    // above stands.
    if (authState.isAuthenticated || authState.isLocked) {
      return {
        kind: "restoredStateUnavailable",
        error: new Error(
          "The restored data file reported an active session, which cannot be trusted after a restore.",
        ),
      };
    }

    ports.publish({ epoch: clearedEpoch, authState });

    return { kind: "restored", authState };
  } catch (error) {
    // The restore succeeded; only reading the new state failed. The shell stays
    // signed out with nothing cached, which is the safe end of that ambiguity.
    return {
      kind: "restoredStateUnavailable",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
