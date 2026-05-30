export const licenseProductId = "arak-rental-windows";

export type LicenseStatusMode = "licensed" | "readonly" | "trial";

export type LicenseReadonlyReason =
  | "license-expired"
  | "license-invalid"
  | "license-missing"
  | "machine-code-unavailable"
  | "system-clock-invalid"
  | "trial-expired"
  | "trial-invalid"
  | "trial-missing"
  | "trial-wrong-machine";

export type LicenseInfo = {
  licenseId: string;
  customerName: string;
  issuedAt: string;
  expiresAt: string | null;
};

export type TrialInfo = {
  startedAt: string;
  expiresAt: string;
  daysRemaining?: number;
};

export type LicenseStatus = {
  mode: LicenseStatusMode;
  canWrite: boolean;
  machineCode: string | null;
  license: LicenseInfo | null;
  trial: TrialInfo | null;
  reason: LicenseReadonlyReason | null;
  message?: string | null;
};

export type LicenseRequestFile = {
  productId: typeof licenseProductId;
  appVersion: string;
  machineCode: string;
  requestedAt: string;
};

export type LicenseRequestExportResult = {
  success: boolean;
  filePath?: string;
  request?: LicenseRequestFile;
  error?: string;
};

export type LicenseImportResult = {
  success: boolean;
  status: LicenseStatus;
  error?: string;
};
