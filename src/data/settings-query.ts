import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { defaultShopSettings, type ShopSettings } from "@/shared/settings";
import { rentalAppApi } from "./rental-app-api";
import { settingsKey } from "./query-keys";
import { useQueryEpoch } from "./session-context";

/**
 * The shop settings, fetched once per session and shared by everything.
 *
 * Around eighty components call `useI18n()`, and each used to issue its own
 * `settings.get`. One query key means one request, and every consumer re-renders
 * from the same object when it changes.
 */
export function useShopSettingsQuery() {
  const epoch = useQueryEpoch();

  return useQuery<ShopSettings, Error>({
    queryKey: settingsKey(epoch),
    queryFn: () => rentalAppApi.settings.get(),
  });
}

/**
 * Settings for rendering: the real ones once loaded, the defaults until then.
 *
 * The fallback is returned, never written into the cache. Seeding the cache
 * with defaults would make a failed fetch look like a successful answer from
 * the main process — the query would sit there "successful" and never retry,
 * and a later reader could not tell a real single-language shop from one whose
 * settings simply had not arrived.
 */
export function useShopSettings(): ShopSettings {
  return useShopSettingsQuery().data ?? defaultShopSettings;
}

/**
 * Publishes settings the main process just returned from a save.
 *
 * Used after saving the form, choosing or clearing a logo or signature, and
 * changing the owner PIN. Writing the returned object straight into the cache
 * keeps the language, currency and logo in the header correct immediately,
 * without a second round trip.
 */
export function useSetShopSettings(): (settings: ShopSettings) => void {
  const queryClient = useQueryClient();
  const epoch = useQueryEpoch();

  return useCallback(
    (settings: ShopSettings) => {
      queryClient.setQueryData(settingsKey(epoch), settings);
    },
    [queryClient, epoch],
  );
}
