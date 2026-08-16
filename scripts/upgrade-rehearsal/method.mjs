export const upgradeMethodValues = Object.freeze(["updater", "manual-installer"]);

export function readUpgradeMethod(value) {
  const method = value?.trim() || "updater";

  if (!upgradeMethodValues.includes(method)) {
    throw new Error(
      `RENTAL_UPGRADE_METHOD must be one of ${upgradeMethodValues.join(", ")}; received ${JSON.stringify(value)}`,
    );
  }

  return method;
}
