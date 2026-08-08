import { QueryClient } from "@tanstack/react-query";

/**
 * Defaults for a local desktop app talking to SQLite over IPC.
 *
 * `networkMode: "always"` is the important one. TanStack assumes a web app and
 * pauses work when the browser reports itself offline; here "the network" is a
 * function call into the same machine, so a laptop with no Wi-Fi must still be
 * able to write a rental. Reads and writes both opt out.
 *
 * `retry: false` because an IPC call that failed did so for a reason the user
 * needs to see — a permission refusal, a read-only licence, a business rule. A
 * silent second attempt would delay the message, and repeating a failed
 * mutation could record a payment twice.
 *
 * `staleTime: 0` keeps the app's existing habit of showing current data. Focus
 * and reconnect refetching stay off: nothing changes behind this app's back,
 * and alt-tabbing should not reload a page the user is reading.
 */
export function createRendererQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        networkMode: "always",
        retry: false,
      },
    },
  });
}

/** The one client for the app's lifetime, created outside React's render. */
export const rendererQueryClient = createRendererQueryClient();
