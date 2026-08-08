import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthState } from "@/shared/auth";
import { businessKey, settingsKey } from "./query-keys";
import { createRendererQueryClient } from "./query-client";
import { createSerialQueue } from "./serial-queue";
import { resetRendererSession } from "./session-transition";

/**
 * A stand-in for the session provider: the same order of operations, without a
 * React tree. Every screen adopts a new `AuthState` through one call, so what
 * matters is that the call always clears first and advances the epoch.
 */
function makeSession(queryClient: QueryClient) {
  let epoch = 0;
  let authState: AuthState | null = null;

  return {
    get epoch() {
      return epoch;
    },
    get authState() {
      return authState;
    },
    async applyAuthState(next: AuthState) {
      epoch = await resetRendererSession(queryClient, epoch);
      authState = next;
    },
  };
}

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

function seededSession() {
  client = createRendererQueryClient();
  const session = makeSession(client);

  client.setQueryData(businessKey(0, "rentals", "list"), { rows: ["rental"] });
  client.setQueryData(settingsKey(0), {
    ownerSignatureDataUrl: "data:image/png;base64,SECRET",
    ownerSignaturePath: "C:/owner/signature.png",
    shopLogoPath: "C:/owner/logo.png",
    scheduledBackupFolder: "C:/owner/backups",
  });

  return { queryClient: client, session };
}

describe("adopting a new session", () => {
  it("clears business rows and privileged settings on logout", async () => {
    const { queryClient, session } = seededSession();

    await session.applyAuthState(authState());

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(session.epoch).toBe(1);
    // The settings object carries the owner's signature and backup folder, all
    // readable only with settings.view. None of it may survive a sign-out.
    expect(queryClient.getQueryData(settingsKey(session.epoch))).toBeUndefined();
  });

  it("clears them on lock as well", async () => {
    const { queryClient, session } = seededSession();

    await session.applyAuthState(authState({ isLocked: true, isAuthenticated: true }));

    expect(queryClient.getQueryData(settingsKey(0))).toBeUndefined();
    expect(queryClient.getQueryData(businessKey(0, "rentals", "list"))).toBeUndefined();
  });

  it("gives each successive session its own epoch", async () => {
    const { session } = seededSession();

    await session.applyAuthState(signedIn);
    const first = session.epoch;
    await session.applyAuthState(authState());
    await session.applyAuthState(signedIn);

    expect(session.epoch).toBeGreaterThan(first);
  });

  it("leaves the previous user's rows unreachable from the new session", async () => {
    const { queryClient, session } = seededSession();

    await session.applyAuthState(signedIn);

    expect(
      queryClient.getQueryData(businessKey(session.epoch, "rentals", "list")),
    ).toBeUndefined();
  });
});

describe("overlapping transitions", () => {
  /**
   * `RendererSessionProvider` funnels every transition through
   * `createSerialQueue`. These use that same queue rather than a copy of it, so
   * a change to the production ordering breaks these tests.
   */
  function queuedSession(queryClient: QueryClient) {
    const queue = createSerialQueue();
    let epoch = 0;
    let authState: AuthState | null = null;
    const published: Array<{ epoch: number; authState: AuthState | null }> = [];

    return {
      get epoch() {
        return epoch;
      },
      get authState() {
        return authState;
      },
      published,
      transition(next: AuthState, delayMs: number) {
        return queue.run(async () => {
          // Stands in for the variable time a real cancel/getState round trip
          // takes, so a slow transition really can overtake a fast one.
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          epoch = await resetRendererSession(queryClient, epoch);
          authState = next;
          published.push({ epoch, authState: next });
        });
      },
      failingTransition() {
        return queue.run(() => Promise.reject(new Error("transition failed")));
      },
    };
  }

  it("never publishes the same epoch twice", async () => {
    client = createRendererQueryClient();
    const session = queuedSession(client);

    await Promise.all([
      session.transition(signedIn, 20),
      session.transition(authState(), 0),
      session.transition(signedIn, 10),
    ]);

    const epochs = session.published.map((entry) => entry.epoch);

    expect(new Set(epochs).size).toBe(epochs.length);
    expect(epochs).toEqual([1, 2, 3]);
  });

  it("leaves the last transition started as the one in effect", async () => {
    client = createRendererQueryClient();
    const session = queuedSession(client);

    // The slow one is submitted first; without serialization it would settle
    // last and reinstate a session the user has already left.
    await Promise.all([
      session.transition(signedIn, 30),
      session.transition(authState(), 0),
    ]);

    expect(session.authState?.isAuthenticated).toBe(false);
    expect(session.published.at(-1)?.authState?.isAuthenticated).toBe(false);
  });

  it("keeps the queue moving after a transition rejects", async () => {
    client = createRendererQueryClient();
    const session = queuedSession(client);

    await session.failingTransition().catch(() => undefined);
    await session.transition(signedIn, 0);

    expect(session.epoch).toBe(1);
    expect(session.authState?.isAuthenticated).toBe(true);
  });
});

describe("the serial queue itself", () => {
  it("runs tasks in submission order, not completion order", async () => {
    const queue = createSerialQueue();
    const order: string[] = [];

    await Promise.all([
      queue.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        order.push("slow first");
      }),
      queue.run(async () => {
        order.push("fast second");
      }),
    ]);

    expect(order).toEqual(["slow first", "fast second"]);
  });

  it("never overlaps two tasks", async () => {
    const queue = createSerialQueue();
    let running = 0;
    let maxConcurrent = 0;

    await Promise.all(
      [30, 0, 15, 5].map((delay) =>
        queue.run(async () => {
          running += 1;
          maxConcurrent = Math.max(maxConcurrent, running);
          await new Promise((resolve) => setTimeout(resolve, delay));
          running -= 1;
        }),
      ),
    );

    expect(maxConcurrent).toBe(1);
  });

  it("surfaces a task's rejection to its own caller only", async () => {
    const queue = createSerialQueue();

    await expect(queue.run(() => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    await expect(queue.run(() => Promise.resolve("fine"))).resolves.toBe("fine");
  });
});
