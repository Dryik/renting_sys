export const upgradeMethodValues: readonly ["updater", "manual-installer"];

export function readUpgradeMethod(
  value?: string,
): (typeof upgradeMethodValues)[number];
