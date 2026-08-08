import { createContext, useContext } from "react";
import type { AuthState } from "@/shared/auth";
import type { QueryEpoch } from "./query-keys";
import type { RestoreOutcome } from "./restore-transition";

export type RendererSession = {
  /** Prefix of every cache key. Increases on each session transition. */
  epoch: QueryEpoch;
  /** The most recent state the main process reported. */
  authState: AuthState | null;
};

export type RendererSessionValue = RendererSession & {
  /**
   * The only way to adopt a new `AuthState`. Cancels in-flight work, empties
   * the caches, moves the epoch on and publishes the state — in that order, as
   * one step, so no caller can do three of the four.
   */
  applyAuthState: (next: AuthState) => Promise<void>;
  /** Re-reads the state from the main process and applies it. */
  refreshAuth: () => Promise<void>;
  /**
   * Finishes a successful restore: clears the renderer and signs out first,
   * then reads the replaced file's state. Fails closed.
   */
  completeRestore: () => Promise<RestoreOutcome>;
};

export const RendererSessionContext = createContext<RendererSessionValue | null>(
  null,
);

export function useRendererSession(): RendererSessionValue {
  const value = useContext(RendererSessionContext);

  if (!value) {
    throw new Error(
      "useRendererSession must be used inside RendererSessionProvider.",
    );
  }

  return value;
}

/** The current epoch on its own, for building keys. */
export function useQueryEpoch(): QueryEpoch {
  return useRendererSession().epoch;
}
