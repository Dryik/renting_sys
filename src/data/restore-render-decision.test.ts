import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthState } from "@/shared/auth";
import { businessKey, systemKey } from "./query-keys";
import { createRendererQueryClient } from "./query-client";
import {
  completeSuccessfulRestore,
  signedOutAuthState,
} from "./restore-transition";

/**
 * `App` picks a screen from `authState` alone, in a fixed order. This mirrors
 * that ladder so the restore transition can be judged by what the user ends up
 * looking at, not merely by what it returns.
 *
 * Kept in step with App.tsx: loading, licence lock-out, owner setup, lock
 * screen, login, forced PIN change, then the authenticated shell.
 */
type Screen =
  | "loading"
  | "ownerSetup"
  | "lockScreen"
  | "login"
  | "changePin"
  | "authenticatedShell";

function screenFor(authState: AuthState | null): Screen {
  if (!authState) {
    return "loading";
  }

  if (authState.needsOwnerSetup) {
    return "ownerSetup";
  }

  if (authState.isLocked) {
    return "lockScreen";
  }

  if (!authState.isAuthenticated) {
    return "login";
  }

  if (authState.currentUser?.mustChangePassword) {
    return "changePin";
  }

  return "authenticatedShell";
}

const signedIn: AuthState = {
  needsOwnerSetup: false,
  isAuthenticated: true,
  isLocked: false,
  currentUser: {
    id: 1,
    fullName: "Owner",
    username: "owner",
    roleKey: "owner_admin",
    permissions: ["settings.view"],
    mustChangePassword: false,
  },
} as AuthState;

let client: QueryClient | null = null;

afterEach(() => {
  client?.clear();
  client = null;
});

/** A signed-in shell with the previous user's rows cached. */
function signedInApp() {
  client = createRendererQueryClient();
  let epoch = 3;
  let authState: AuthState | null = signedIn;

  client.setQueryData(businessKey(epoch, "rentals", "list"), {
    rows: ["previous user's rental"],
  });

  return {
    queryClient: client,
    get screen() {
      return screenFor(authState);
    },
    get authState() {
      return authState;
    },
    get epoch() {
      return epoch;
    },
    ports(getAuthState: () => Promise<AuthState>) {
      return {
        queryClient: client!,
        getAuthState,
        publish: (next: { epoch: number; authState: AuthState }) => {
          epoch = next.epoch;
          authState = next.authState;
        },
        currentEpoch: () => epoch,
      };
    },
  };
}

describe("what the user sees after a restore", () => {
  it("starts on the authenticated shell", () => {
    expect(signedInApp().screen).toBe("authenticatedShell");
  });

  it("lands on the login screen when the new state reads cleanly", async () => {
    const app = signedInApp();

    await completeSuccessfulRestore(
      app.ports(() => Promise.resolve(signedOutAuthState)),
    );

    expect(app.screen).toBe("login");
  });

  it("lands on the login screen when the state read fails", async () => {
    const app = signedInApp();

    await completeSuccessfulRestore(
      app.ports(() => Promise.reject(new Error("database not readable"))),
    );

    // The three outcomes that would be wrong: the old shell, an indefinite
    // spinner, or an owner-setup screen over a database that has owners.
    expect(app.screen).toBe("login");
    expect(app.screen).not.toBe("authenticatedShell");
    expect(app.screen).not.toBe("loading");
    expect(app.screen).not.toBe("ownerSetup");
  });

  it("never leaves the app on the loading screen", async () => {
    const app = signedInApp();

    await completeSuccessfulRestore(
      app.ports(() => Promise.reject(new Error("read failed"))),
    );

    // `null` is reserved for "the app has not read its state yet". Publishing
    // it here is what used to strand the user on a spinner with no way out.
    expect(app.authState).not.toBeNull();
    expect(app.screen).not.toBe("loading");
  });

  it("empties the cache even when the read fails", async () => {
    const app = signedInApp();

    await completeSuccessfulRestore(
      app.ports(() => Promise.reject(new Error("read failed"))),
    );

    expect(app.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("refuses to show the shell for a session the restored file claims", async () => {
    const app = signedInApp();

    const outcome = await completeSuccessfulRestore(
      app.ports(() => Promise.resolve(signedIn)),
    );

    expect(outcome.kind).toBe("restoredStateUnavailable");
    expect(app.screen).toBe("login");
  });

  it("refuses a locked session from the restored file too", async () => {
    const app = signedInApp();

    const outcome = await completeSuccessfulRestore(
      app.ports(() =>
        Promise.resolve({ ...signedOutAuthState, isLocked: true } as AuthState),
      ),
    );

    // A lock screen would ask for the previous user's PIN against a file that
    // may not contain that user at all.
    expect(outcome.kind).toBe("restoredStateUnavailable");
    expect(app.screen).toBe("login");
  });

  it("shows owner setup when the restored file genuinely has no owner", async () => {
    const app = signedInApp();

    await completeSuccessfulRestore(
      app.ports(() =>
        Promise.resolve({
          ...signedOutAuthState,
          needsOwnerSetup: true,
        } as AuthState),
      ),
    );

    // A successfully read state is honoured, including this one.
    expect(app.screen).toBe("ownerSetup");
  });

  it("recovers to the real state when a retry succeeds", async () => {
    const app = signedInApp();
    let attempts = 0;

    await completeSuccessfulRestore(
      app.ports(() => {
        attempts += 1;

        return Promise.reject(new Error("not readable yet"));
      }),
    );
    expect(app.screen).toBe("login");

    // What the "Try again" button runs.
    const outcome = await completeSuccessfulRestore(
      app.ports(() => {
        attempts += 1;

        return Promise.resolve(signedOutAuthState);
      }),
    );

    expect(attempts).toBe(2);
    expect(outcome.kind).toBe("restored");
    expect(app.screen).toBe("login");
  });
});

describe("the safe signed-out state", () => {
  it("renders the login screen", () => {
    expect(screenFor(signedOutAuthState)).toBe("login");
  });

  it("claims no user, no lock and no owner setup", () => {
    expect(signedOutAuthState).toEqual({
      needsOwnerSetup: false,
      isAuthenticated: false,
      isLocked: false,
      currentUser: null,
    });
  });
});

describe("the login screen after a restore whose state read failed", () => {
  /**
   * The login user list is an epoch-scoped system query, so it is tied to the
   * same transition the auth read is. That is the whole point: "Try again"
   * advances the epoch, which changes the list's key, which refetches it from
   * the *restored* database. A mount-only effect would have gone on showing
   * the previous file's users — or none — until the app was restarted.
   */
  type LoginUser = { id: number; username: string; fullName: string };

  const previousFileUsers: LoginUser[] = [
    { id: 1, username: "olduser", fullName: "Previous File Owner" },
  ];
  const restoredFileUsers: LoginUser[] = [
    { id: 9, username: "restored", fullName: "Restored Owner" },
    { id: 10, username: "restoredstaff", fullName: "Restored Staff" },
  ];

  function loginUsersKey(epoch: number) {
    return systemKey(epoch, "auth.loginUsers");
  }

  it("shows the restored database's users after a successful retry", async () => {
    const app = signedInApp();
    const startingEpoch = 3;

    // The previous session had its own user list cached.
    app.queryClient.setQueryData(loginUsersKey(startingEpoch), previousFileUsers);

    // Restore succeeds, but neither the auth state nor the user list can be
    // read from the freshly swapped file yet.
    await completeSuccessfulRestore(
      app.ports(() => Promise.reject(new Error("database not readable"))),
    );
    const failedEpoch = app.epoch;

    await app.queryClient
      .fetchQuery({
        queryKey: loginUsersKey(failedEpoch),
        queryFn: () => Promise.reject(new Error("database not readable")),
      })
      .catch(() => undefined);

    expect(app.screen).toBe("login");
    expect(app.queryClient.getQueryData(loginUsersKey(failedEpoch))).toBeUndefined();
    // The previous file's users are gone, not merely hidden.
    expect(app.queryClient.getQueryData(loginUsersKey(startingEpoch))).toBeUndefined();

    // "Try again" — the same transition, now with a readable database.
    const outcome = await completeSuccessfulRestore(
      app.ports(() => Promise.resolve(signedOutAuthState)),
    );
    const retriedEpoch = app.epoch;

    expect(outcome.kind).toBe("restored");
    expect(retriedEpoch).toBeGreaterThan(failedEpoch);

    // The new epoch means a new key, so the list is fetched again rather than
    // read from whatever the failed attempt left behind.
    const users = await app.queryClient.fetchQuery({
      queryKey: loginUsersKey(retriedEpoch),
      queryFn: () => Promise.resolve(restoredFileUsers),
    });

    expect(app.screen).toBe("login");
    expect(users).toEqual(restoredFileUsers);
    expect(users.map((user) => user.username)).toEqual(["restored", "restoredstaff"]);
  });

  it("gives the retry a different key from the failed attempt", async () => {
    const app = signedInApp();

    await completeSuccessfulRestore(
      app.ports(() => Promise.reject(new Error("not readable"))),
    );
    const failedKey = loginUsersKey(app.epoch);

    await completeSuccessfulRestore(
      app.ports(() => Promise.resolve(signedOutAuthState)),
    );
    const retriedKey = loginUsersKey(app.epoch);

    expect(retriedKey).not.toEqual(failedKey);
  });

  it("keeps the user list out of the business root", async () => {
    const app = signedInApp();

    await completeSuccessfulRestore(
      app.ports(() => Promise.resolve(signedOutAuthState)),
    );

    const key = loginUsersKey(app.epoch);
    const businessRoot = businessKey(app.epoch, "", "").slice(0, 3);

    // Recording a payment must not send the sign-in list off again.
    expect(key.slice(0, 3)).not.toEqual(businessRoot);
  });
});
