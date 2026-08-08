import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { businessKey, businessRootKey, systemKey } from "./query-keys";
import { useQueryEpoch } from "./session-context";

/**
 * A business read, keyed to the current session.
 *
 * Callers pass the domain, the operation and the request they are about to
 * send; the key is derived from all three, so two different requests can never
 * share an answer and no request survives a session change.
 */
export function useBusinessQuery<TData>(
  domain: string,
  operation: string,
  request: unknown,
  queryFn: () => Promise<TData>,
  options?: Omit<
    UseQueryOptions<TData, Error, TData, readonly unknown[]>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData, Error> {
  const epoch = useQueryEpoch();

  return useQuery<TData, Error, TData, readonly unknown[]>({
    queryKey: businessKey(epoch, domain, operation, request),
    queryFn,
    ...options,
  });
}

/**
 * A read that is not business data: licensing, diagnostics, app info, update
 * state. Kept out of the business root so a rental payment does not re-check
 * the licence.
 */
export function useSystemQuery<TData>(
  operation: string,
  request: unknown,
  queryFn: () => Promise<TData>,
  options?: Omit<
    UseQueryOptions<TData, Error, TData, readonly unknown[]>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData, Error> {
  const epoch = useQueryEpoch();

  return useQuery<TData, Error, TData, readonly unknown[]>({
    queryKey: systemKey(epoch, operation, request),
    queryFn,
    ...options,
  });
}

/**
 * Marks every inactive business query stale and refetches the active ones.
 *
 * Awaited by the caller, so a mutation stays pending until the screen behind it
 * is showing the new numbers. Without the await, a dialog would close on data
 * that is one write out of date.
 */
export async function invalidateBusinessData(
  queryClient: QueryClient,
  epoch: number,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: businessRootKey(epoch) });
}

/**
 * The key a `useBusinessQuery` with the same arguments would use.
 *
 * Lets a handler read what a just-completed write left in the cache. Because
 * `useBusinessMutation` awaits the invalidation, and invalidation refetches
 * active queries, the entry under this key is already the post-write answer —
 * so a screen that must re-select a row from the fresh list can do it without
 * issuing a second request.
 */
export function useBusinessQueryKey(
  domain: string,
  operation: string,
  request?: unknown,
): readonly unknown[] {
  const epoch = useQueryEpoch();

  return businessKey(epoch, domain, operation, request);
}

export function useInvalidateBusinessData(): () => Promise<void> {
  const queryClient = useQueryClient();
  const epoch = useQueryEpoch();

  return useCallback(
    () => invalidateBusinessData(queryClient, epoch),
    [queryClient, epoch],
  );
}

/**
 * A write that changes business records. On success every business read for
 * this session is invalidated, and the mutation does not resolve until that
 * has happened.
 */
export function useBusinessMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<
    UseMutationOptions<TData, Error, TVariables>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (
      data: TData,
      variables: TVariables,
    ) => void | Promise<void>;
  },
): UseMutationResult<TData, Error, TVariables> {
  const invalidate = useInvalidateBusinessData();
  const { onSuccess, ...rest } = options ?? {};

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    onSuccess: async (data, variables) => {
      await invalidate();
      await onSuccess?.(data, variables);
    },
    ...rest,
  });
}

/**
 * A command: printing, exporting, opening a file, an approval, an update
 * check, a restart. It performs an action rather than changing business
 * records, so it deliberately invalidates nothing — reprinting a contract must
 * not make the rentals list flicker.
 */
export function useCommandMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">,
): UseMutationResult<TData, Error, TVariables> {
  return useMutation<TData, Error, TVariables>({ mutationFn, ...options });
}
