import { useEffect, useState } from "react";
import {
  defaultShopSettings,
  type ShopSettings,
} from "@/shared/settings";

const settingsUpdatedEvent = "rental-app:settings-updated";

export function notifyShopSettingsUpdated(settings: ShopSettings): void {
  window.dispatchEvent(new CustomEvent<ShopSettings>(settingsUpdatedEvent, {
    detail: settings,
  }));
}

export function useShopSettings(): ShopSettings {
  const [settings, setSettings] = useState<ShopSettings>(defaultShopSettings);

  useEffect(() => {
    let isMounted = true;

    window.rentalApp.settings
      .get()
      .then((loadedSettings) => {
        if (isMounted) {
          setSettings(loadedSettings);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSettings(defaultShopSettings);
        }
      });

    const handleSettingsUpdated = (event: Event) => {
      const updatedSettings = (event as CustomEvent<ShopSettings>).detail;

      if (updatedSettings && isMounted) {
        setSettings(updatedSettings);
      }
    };

    window.addEventListener(settingsUpdatedEvent, handleSettingsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(settingsUpdatedEvent, handleSettingsUpdated);
    };
  }, []);

  return settings;
}
