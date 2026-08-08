import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { AuthState } from "@/shared/auth";
import { rentalAppApi } from "./rental-app-api";
import {
  completeSuccessfulRestore,
  type RestoreOutcome,
} from "./restore-transition";
import { createSerialQueue } from "./serial-queue";
import {
  RendererSessionContext,
  type RendererSessionValue,
} from "./session-context";
import { resetRendererSession } from "./session-transition";

/**
 * Owns the session epoch and is the only place an `AuthState` is adopted.
 *
 * Every screen that changes who is signed in — owner setup, login, lock,
 * unlock, logout, PIN change, and the initial read — hands its result here
 * rather than to a `setState`. That is what makes "cached data never crosses a
 * user" a property of the app instead of a rule each caller has to remember.
 */
export function RendererSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  // Read inside the callback so a transition never uses a stale epoch when two
  // arrive close together.
  const epochRef = useRef(epoch);

  // Transitions run one at a time; see `createSerialQueue` for why.
  const queueRef = useRef(createSerialQueue());
  const enqueue = useCallback(
    <T,>(task: () => Promise<T>) => queueRef.current.run(task),
    [],
  );

  const publish = useCallback(
    (next: { epoch: number; authState: AuthState | null }) => {
      epochRef.current = next.epoch;
      setEpoch(next.epoch);
      setAuthState(next.authState);
    },
    [],
  );

  const applyAuthState = useCallback(
    (next: AuthState) =>
      enqueue(async () => {
        const nextEpoch = await resetRendererSession(
          queryClient,
          epochRef.current,
        );

        publish({ epoch: nextEpoch, authState: next });
      }),
    [enqueue, publish, queryClient],
  );

  const refreshAuth = useCallback(
    () =>
      enqueue(async () => {
        const next = await rentalAppApi.auth.getState();
        const nextEpoch = await resetRendererSession(
          queryClient,
          epochRef.current,
        );

        publish({ epoch: nextEpoch, authState: next });
      }),
    [enqueue, publish, queryClient],
  );

  /**
   * Runs after the main process reports a successful restore. Clears first and
   * reads second, so a failed read cannot leave the previous session on screen.
   */
  const completeRestore = useCallback(
    (): Promise<RestoreOutcome> =>
      enqueue(() =>
        completeSuccessfulRestore({
          queryClient,
          getAuthState: () => rentalAppApi.auth.getState(),
          publish,
          currentEpoch: () => epochRef.current,
        }),
      ),
    [enqueue, publish, queryClient],
  );

  const value = useMemo<RendererSessionValue>(
    () => ({ epoch, authState, applyAuthState, completeRestore, refreshAuth }),
    [epoch, authState, applyAuthState, completeRestore, refreshAuth],
  );

  return (
    <RendererSessionContext.Provider value={value}>
      {children}
    </RendererSessionContext.Provider>
  );
}
