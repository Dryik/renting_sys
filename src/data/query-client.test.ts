import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { invalidateBusinessData } from "./hooks";
import {
  businessKey,
  businessRootKey,
  settingsKey,
  systemKey,
} from "./query-keys";
import { createRendererQueryClient } from "./query-client";
import { resetRendererSession } from "./session-transition";

let client: QueryClient | null = null;

function makeClient(): QueryClient {
  client = createRendererQueryClient();

  return client;
}

afterEach(() => {
  client?.clear();
  client = null;
});

describe("renderer query defaults", () => {
  it("never pauses reads or writes when the browser reports itself offline", () => {
    const defaults = makeClient().getDefaultOptions();

    // This is a desktop app talking to a local file. "Offline" says nothing
    // about whether the database is reachable, so it must not gate anything.
    expect(defaults.queries?.networkMode).toBe("always");
    expect(defaults.mutations?.networkMode).toBe("always");
  });

  it("does not retry a failed read or repeat a failed write", () => {
    const defaults = makeClient().getDefaultOptions();

    // A failed IPC call carries a message the user needs; a silent retry would
    // delay it, and repeating a write could record a payment twice.
    expect(defaults.queries?.retry).toBe(false);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it("keeps data fresh on mount and quiet on focus", () => {
    const defaults = makeClient().getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(0);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.refetchOnReconnect).toBe(false);
  });

  it("really does refuse to retry, not merely claim to", async () => {
    const failing = makeClient();
    let attempts = 0;

    await failing
      .fetchQuery({
        queryKey: businessKey(0, "vehicles", "list"),
        queryFn: () => {
          attempts += 1;
          throw new Error("refused");
        },
      })
      .catch(() => undefined);

    expect(attempts).toBe(1);
  });
});

describe("query keys", () => {
  it("puts the session epoch first so keys cannot survive a session change", () => {
    expect(businessKey(1, "vehicles", "list", { page: 1 })).not.toEqual(
      businessKey(2, "vehicles", "list", { page: 1 }),
    );
    expect(businessKey(7, "vehicles", "list")[1]).toBe(7);
  });

  it("gives identical arguments an identical key", () => {
    expect(businessKey(3, "customers", "list", { page: 2, search: "ali" })).toEqual(
      businessKey(3, "customers", "list", { page: 2, search: "ali" }),
    );
  });

  it("separates pagination, filters and dates", () => {
    const base = { page: 1, search: "", dateFrom: "2026-01-01" };

    expect(businessKey(1, "payments", "list", base)).not.toEqual(
      businessKey(1, "payments", "list", { ...base, page: 2 }),
    );
    expect(businessKey(1, "payments", "list", base)).not.toEqual(
      businessKey(1, "payments", "list", { ...base, search: "cash" }),
    );
    expect(businessKey(1, "payments", "list", base)).not.toEqual(
      businessKey(1, "payments", "list", { ...base, dateFrom: "2026-02-01" }),
    );
  });

  it("separates record ids", () => {
    expect(businessKey(1, "payments", "listForRental", 4)).not.toEqual(
      businessKey(1, "payments", "listForRental", 5),
    );
  });

  it("separates domains and operations", () => {
    expect(businessKey(1, "vehicles", "list")).not.toEqual(
      businessKey(1, "customers", "list"),
    );
    expect(businessKey(1, "reports", "deposits")).not.toEqual(
      businessKey(1, "reports", "outstanding"),
    );
  });

  it("prefixes every key family with the session epoch", () => {
    for (const key of [
      businessKey(5, "vehicles", "list"),
      settingsKey(5),
      systemKey(5, "license"),
    ]) {
      expect(key[1]).toBe(5);
    }
  });

  it("keeps settings and system reads outside the business root", () => {
    const root = businessRootKey(1);

    expect(settingsKey(1).slice(0, root.length)).not.toEqual([...root]);
    expect(systemKey(1, "license").slice(0, root.length)).not.toEqual([...root]);
  });
});

describe("session reset", () => {
  it("removes cached business rows and privileged settings", async () => {
    const queryClient = makeClient();

    queryClient.setQueryData(businessKey(0, "customers", "list"), { rows: [1] });
    queryClient.setQueryData(settingsKey(0), { ownerSignatureDataUrl: "secret" });

    const nextEpoch = await resetRendererSession(queryClient, 0);

    expect(nextEpoch).toBe(1);
    expect(queryClient.getQueryData(businessKey(0, "customers", "list"))).toBeUndefined();
    expect(queryClient.getQueryData(settingsKey(0))).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("puts settings fetched by one user out of the next user's reach", async () => {
    const queryClient = makeClient();

    queryClient.setQueryData(settingsKey(0), {
      ownerSignatureDataUrl: "data:image/png;base64,SECRET",
      scheduledBackupFolder: "C:/owner/backups",
    });

    const nextEpoch = await resetRendererSession(queryClient, 0);

    // The new session reads a different key, and the old key is gone, so there
    // is nothing to fall back to even by accident.
    expect(queryClient.getQueryData(settingsKey(nextEpoch))).toBeUndefined();
    expect(queryClient.getQueryData(settingsKey(0))).toBeUndefined();
  });

  it("clears mutation history too", async () => {
    const queryClient = makeClient();

    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: async () => "done" })
      .execute(undefined);

    expect(queryClient.getMutationCache().getAll().length).toBeGreaterThan(0);

    await resetRendererSession(queryClient, 0);

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("cannot be repopulated by a request that was already in flight", async () => {
    const queryClient = makeClient();
    let release: ((value: string) => void) | undefined;
    const deferred = new Promise<string>((resolve) => {
      release = resolve;
    });

    const inFlight = queryClient
      .fetchQuery({
        queryKey: businessKey(0, "rentals", "list"),
        queryFn: () => deferred,
      })
      .catch(() => undefined);

    const nextEpoch = await resetRendererSession(queryClient, 0);

    // The old session's answer arrives late, as it would after a fast logout.
    release?.("previous user's rentals");
    await inFlight;

    expect(queryClient.getQueryData(businessKey(nextEpoch, "rentals", "list"))).toBeUndefined();
    expect(queryClient.getQueryData(businessKey(0, "rentals", "list"))).toBeUndefined();
  });
});

describe("business invalidation", () => {
  it("refetches an active business query", async () => {
    const queryClient = makeClient();
    let calls = 0;

    const observer = new QueryObserver(queryClient, {
      queryKey: businessKey(0, "rentals", "list"),
      queryFn: async () => {
        calls += 1;

        return calls;
      },
    });
    // A subscribed observer is what makes a query "active" — the state a
    // mounted screen puts it in, and the one invalidation refetches.
    const unsubscribe = observer.subscribe(() => undefined);

    await observer.refetch();
    expect(calls).toBe(1);

    await invalidateBusinessData(queryClient, 0);

    expect(calls).toBe(2);
    unsubscribe();
  });

  it("marks an inactive business query stale instead of refetching it", async () => {
    const queryClient = makeClient();
    let calls = 0;

    await queryClient.fetchQuery({
      queryKey: businessKey(0, "vehicles", "list"),
      queryFn: async () => {
        calls += 1;

        return calls;
      },
    });

    await invalidateBusinessData(queryClient, 0);

    const entry = queryClient.getQueryCache().find({
      queryKey: businessKey(0, "vehicles", "list"),
    });

    // Nobody is watching it, so it is not fetched again — but it will be the
    // moment a screen mounts that needs it.
    expect(calls).toBe(1);
    expect(entry?.isStale()).toBe(true);
  });

  it("leaves settings and system state alone", async () => {
    const queryClient = makeClient();

    await queryClient.fetchQuery({
      queryKey: settingsKey(0),
      queryFn: async () => ({ shopName: "Shop" }),
    });
    await queryClient.fetchQuery({
      queryKey: systemKey(0, "license"),
      queryFn: async () => ({ canWrite: true }),
    });

    await invalidateBusinessData(queryClient, 0);

    // Printing a contract or recording a payment must not re-check the licence
    // or re-read the shop settings.
    expect(
      queryClient.getQueryCache().find({ queryKey: settingsKey(0) })?.isStale(),
    ).toBe(false);
    expect(
      queryClient.getQueryCache().find({ queryKey: systemKey(0, "license") })?.isStale(),
    ).toBe(false);
  });

  it("does not reach into another session's data", async () => {
    const queryClient = makeClient();

    await queryClient.fetchQuery({
      queryKey: businessKey(1, "rentals", "list"),
      queryFn: async () => "epoch one",
    });

    await invalidateBusinessData(queryClient, 0);

    expect(
      queryClient.getQueryCache().find({ queryKey: businessKey(1, "rentals", "list") })?.isStale(),
    ).toBe(false);
  });
});

describe("fetching form options before a form opens", () => {
  /**
   * `RentalsPage.openCreateForm` must not hand the user a stale option list —
   * a vehicle rented a moment ago, or a customer just deactivated, would still
   * be offered. `ensureQueryData` returns whatever is cached without checking,
   * so the page uses `fetchQuery` instead. These pin the difference.
   */
  const optionsKey = businessKey(0, "rentals", "formOptions");

  it("ensureQueryData hands back an invalidated entry unchanged", async () => {
    const queryClient = makeClient();
    let version = 0;
    const queryFn = async () => {
      version += 1;

      return `options v${version}`;
    };

    await queryClient.fetchQuery({ queryKey: optionsKey, queryFn });
    await invalidateBusinessData(queryClient, 0);

    const result = await queryClient.ensureQueryData({ queryKey: optionsKey, queryFn });

    // Stale, and returned anyway — which is exactly the trap.
    expect(result).toBe("options v1");
    expect(version).toBe(1);
  });

  it("fetchQuery refreshes an invalidated entry before returning", async () => {
    const queryClient = makeClient();
    let version = 0;
    const queryFn = async () => {
      version += 1;

      return `options v${version}`;
    };

    await queryClient.fetchQuery({ queryKey: optionsKey, queryFn });
    await invalidateBusinessData(queryClient, 0);

    const result = await queryClient.fetchQuery({
      queryKey: optionsKey,
      queryFn,
      staleTime: 0,
    });

    expect(result).toBe("options v2");
    expect(version).toBe(2);
  });

  it("awaits the refresh rather than resolving early", async () => {
    const queryClient = makeClient();
    let resolved = false;

    await queryClient.fetchQuery({
      queryKey: optionsKey,
      queryFn: async () => "first",
    });
    await invalidateBusinessData(queryClient, 0);

    await queryClient.fetchQuery({
      queryKey: optionsKey,
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        resolved = true;

        return "second";
      },
      staleTime: 0,
    });

    // The form opens only after this resolves, so the data must already be in.
    expect(resolved).toBe(true);
  });
});

describe("a photo save reaches every attachment reader", () => {
  it("invalidates the documents list, the row avatar and the preview together", async () => {
    const queryClient = makeClient();
    const calls = { list: 0, avatar: 0, preview: 0 };

    // The three readers a captured photo has to refresh, each mounted.
    const observers = [
      new QueryObserver(queryClient, {
        queryKey: businessKey(0, "attachments", "list", { entityId: 7 }),
        queryFn: async () => {
          calls.list += 1;

          return calls.list;
        },
      }),
      new QueryObserver(queryClient, {
        queryKey: businessKey(0, "attachments", "customerPhoto", { entityId: 7 }),
        queryFn: async () => {
          calls.avatar += 1;

          return calls.avatar;
        },
      }),
      new QueryObserver(queryClient, {
        queryKey: businessKey(0, "attachments", "getPreview", 42),
        queryFn: async () => {
          calls.preview += 1;

          return calls.preview;
        },
      }),
    ];
    const unsubscribes = observers.map((observer) =>
      observer.subscribe(() => undefined),
    );

    await Promise.all(observers.map((observer) => observer.refetch()));
    expect(calls).toEqual({ list: 1, avatar: 1, preview: 1 });

    // What `useBusinessMutation` does after saveCapturedPhoto succeeds.
    await invalidateBusinessData(queryClient, 0);

    expect(calls).toEqual({ list: 2, avatar: 2, preview: 2 });

    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  });
});
