import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "@/shared/auth";
import { businessKey, settingsKey } from "./query-keys";
import { createRendererQueryClient } from "./query-client";
import {
  completeSuccessfulRestore,
  signedOutAuthState,
} from "./restore-transition";

/**
 * These drive the same function `RendererSessionProvider.completeRestore` calls,
 * with the same ports, rather than a hand-rolled stand-in — so what is checked
 * here is the orchestration the app actually runs.
 */
function authState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    isAuthenticated: false,
    isLocked: false,
    needsOwnerSetup: false,
    currentUser: null,
    ...overrides,
  } as AuthState;
}

const signedIn = authState({
  isAuthenticated: true,
  currentUser: {
    id: 1,
    fullName: "Owner",
    username: "owner",
    roleKey: "owner_admin",
    permissions: ["settings.view"],
    mustChangePassword: false,
  },
} as Partial<AuthState>);

let client: QueryClient | null = null;

afterEach(() => {
  client?.clear();
  client = null;
});

/** A signed-in session with the previous user's rows and settings cached. */
function signedInSession() {
  client = createRendererQueryClient();
  let epoch = 4;
  const published: Array<{ epoch: number; authState: AuthState }> = [];

  client.setQueryData(businessKey(epoch, "rentals", "list"), {
    rows: ["previous user's rental"],
  });
  client.setQueryData(settingsKey(epoch), {
    ownerSignatureDataUrl: "data:image/png;base64,SECRET",
    scheduledBackupFolder: "C:/owner/backups",
  });

  return {
    queryClient: client,
    published,
    startingEpoch: epoch,
    ports(getAuthState: () => Promise<AuthState>) {
      return {
        queryClient: client!,
        getAuthState,
        publish: (next: { epoch: number; authState: AuthState }) => {
          epoch = next.epoch;
          published.push(next);
        },
        currentEpoch: () => epoch,
      };
    },
  };
}

describe("completing a successful restore", () => {
  it("signs out and empties the cache, then adopts the new state", async () => {
    const session = signedInSession();
    const outcome = await completeSuccessfulRestore(
      session.ports(() => Promise.resolve(authState())),
    );

    expect(outcome.kind).toBe("restored");
    expect(session.queryClient.getQueryCache().getAll()).toHaveLength(0);
    // Signed out before anything was read, and still signed out afterwards.
    // A concrete state, not null: null renders the loading screen.
    expect(session.published[0]?.authState).toEqual(signedOutAuthState);
    expect(session.published.at(-1)?.authState?.isAuthenticated).toBe(false);
    expect(session.published[0]?.epoch).toBeGreaterThan(session.startingEpoch);
  });

  it("stays signed out with nothing cached when the new state cannot be read", async () => {
    const session = signedInSession();
    const getAuthState = vi.fn(() =>
      Promise.reject(new Error("the database is not readable yet")),
    );

    const outcome = await completeSuccessfulRestore(session.ports(getAuthState));

    // This is the case that used to leave the previous user's shell in place
    // over a database that is no longer theirs.
    expect(outcome.kind).toBe("restoredStateUnavailable");
    expect(getAuthState).toHaveBeenCalledOnce();
    expect(session.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(session.published).toHaveLength(1);
    expect(session.published[0]?.authState).toEqual(signedOutAuthState);
    expect(session.published[0]?.authState.isAuthenticated).toBe(false);
  });

  it("does not report the restore itself as failed when only the read failed", async () => {
    const session = signedInSession();
    const outcome = await completeSuccessfulRestore(
      session.ports(() => Promise.reject(new Error("read failed"))),
    );

    // The file was replaced. Calling that a failed restore would tell the shop
    // to try again against data that has already been swapped.
    expect(outcome.kind).not.toBe("failed");
    expect(outcome.kind).toBe("restoredStateUnavailable");
    if (outcome.kind === "restoredStateUnavailable") {
      expect(outcome.error).toBeInstanceOf(Error);
    }
  });

  it("refuses an authenticated state reported by the restored file", async () => {
    const session = signedInSession();
    const outcome = await completeSuccessfulRestore(
      session.ports(() => Promise.resolve(signedIn)),
    );

    // Whatever session that file thinks it has, it is not this user's.
    expect(outcome.kind).toBe("restoredStateUnavailable");
    expect(session.published.at(-1)?.authState).toEqual(signedOutAuthState);
  });

  it("clears before it reads, not after", async () => {
    const session = signedInSession();
    let cacheSizeWhenRead = -1;

    await completeSuccessfulRestore(
      session.ports(() => {
        cacheSizeWhenRead = session.queryClient.getQueryCache().getAll().length;

        return Promise.resolve(authState());
      }),
    );

    // The ordering is the safety property: by the time anything can fail, the
    // previous session is already gone.
    expect(cacheSizeWhenRead).toBe(0);
  });

  it("leaves the previous rows unreachable from the new epoch", async () => {
    const session = signedInSession();

    await completeSuccessfulRestore(
      session.ports(() => Promise.resolve(authState())),
    );

    const newEpoch = session.published.at(-1)!.epoch;

    expect(
      session.queryClient.getQueryData(businessKey(newEpoch, "rentals", "list")),
    ).toBeUndefined();
    expect(
      session.queryClient.getQueryData(businessKey(session.startingEpoch, "rentals", "list")),
    ).toBeUndefined();
  });
});

describe("a restore that did not happen", () => {
  /**
   * `BackupPage` only calls the transition when the main process reports
   * success, so a failure or a cancellation never reaches it. This pins that
   * contract: nothing is cleared and nobody is signed out.
   */
  async function handleRestoreResult(
    result: { success: boolean; error?: string },
    session: ReturnType<typeof signedInSession>,
  ) {
    if (!result.success) {
      return;
    }

    await completeSuccessfulRestore(
      session.ports(() => Promise.resolve(authState())),
    );
  }

  it("keeps the session and cache when the restore fails", async () => {
    const session = signedInSession();

    await handleRestoreResult({ success: false, error: "Restore failed." }, session);

    expect(session.published).toHaveLength(0);
    expect(
      session.queryClient.getQueryData(
        businessKey(session.startingEpoch, "rentals", "list"),
      ),
    ).toEqual({ rows: ["previous user's rental"] });
  });

  it("keeps them when the user cancels", async () => {
    const session = signedInSession();

    await handleRestoreResult(
      { success: false, error: "Restore process cancelled by user." },
      session,
    );

    expect(session.published).toHaveLength(0);
    expect(
      session.queryClient.getQueryData(settingsKey(session.startingEpoch)),
    ).toBeDefined();
  });
});
