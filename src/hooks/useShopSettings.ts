/**
 * Kept as the hook every component already imports; the fetching itself now
 * lives in the shared settings query, so all consumers share one request and
 * one cache entry that a session change can clear.
 */
export {
  useSetShopSettings,
  useShopSettings,
  useShopSettingsQuery,
} from "@/data/settings-query";
