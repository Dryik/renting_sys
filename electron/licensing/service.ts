import { app, dialog } from "electron";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  licenseProductId,
  type LicenseImportResult,
  type LicenseInfo,
  type LicenseRequestExportResult,
  type LicenseRequestFile,
  type LicenseStatus,
  type TrialInfo,
} from "../../src/shared/license";
import {
  calculateMachineCode,
  calculateTrialDaysRemaining,
  createTrialIssuedMarker,
  createTrialRecord,
  evaluateTrialIssuedMarker,
  evaluateTrialRecord,
  formatMachineCode,
  verifyPaidLicenseDocument,
  type TrialIssuedMarker,
  type TrialRecord,
} from "./core";
import { licensePublicKeys } from "./public-keys";

const licenseFileName = "license.json";
const trialFileName = "trial.json";
const trialIssuedMarkerFileName = "trial-issued.json";
const maxLicenseFileBytes = 256 * 1024;

let cachedMachineCode: string | null = null;

export function getLicenseStatus(): LicenseStatus {
  const now = new Date();
  const machineCodeResult = tryGetCurrentMachineCode();

  if (!machineCodeResult.ok) {
    return getMachineCodeUnavailableStatus();
  }

  const machineCode = machineCodeResult.machineCode;
  const licenseResult = readAndVerifyLicense(machineCode, now);

  if (licenseResult.ok) {
    return {
      mode: "licensed",
      canWrite: true,
      machineCode: formatMachineCode(machineCode),
      license: toLicenseInfo(licenseResult.payload),
      trial: null,
      reason: null,
    };
  }

  const trialResult = readOrCreateTrial(machineCode, now);

  if (trialResult.ok) {
    return {
      mode: "trial",
      canWrite: true,
      machineCode: formatMachineCode(machineCode),
      license: null,
      trial: toTrialInfo(trialResult.record, now),
      reason: null,
    };
  }

  return {
    mode: "readonly",
    canWrite: false,
    machineCode: formatMachineCode(machineCode),
    license: null,
    trial: trialResult.record ? toTrialInfo(trialResult.record, now) : null,
    reason: trialResult.reason,
  };
}

export function requireLicenseWriteAccess(): void {
  if (!getLicenseStatus().canWrite) {
    throw new Error("License required. The app is currently read-only.");
  }
}

export function isWriteAccessAllowed(): boolean {
  return getLicenseStatus().canWrite;
}

export async function exportLicenseRequest(): Promise<LicenseRequestExportResult> {
  const machineCodeResult = tryGetCurrentMachineCode();

  if (!machineCodeResult.ok) {
    return {
      success: false,
      error: "Machine code unavailable. Cannot export license request.",
    };
  }

  const request: LicenseRequestFile = {
    productId: licenseProductId,
    appVersion: app.getVersion(),
    machineCode: formatMachineCode(machineCodeResult.machineCode),
    requestedAt: new Date().toISOString(),
  };
  const defaultPath = `arak_license_request_${request.machineCode.slice(0, 19)}.json`;
  const { filePath } = await dialog.showSaveDialog({
    title: "Export License Request",
    defaultPath,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!filePath) {
    return {
      success: false,
      request,
      error: "License request export cancelled.",
    };
  }

  fs.writeFileSync(filePath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

  return {
    success: true,
    filePath,
    request,
  };
}

export async function importLicenseFile(): Promise<LicenseImportResult> {
  const machineCodeResult = tryGetCurrentMachineCode();

  if (!machineCodeResult.ok) {
    return {
      success: false,
      status: getMachineCodeUnavailableStatus(),
      error: "Machine code unavailable. Cannot import license file.",
    };
  }

  const { filePaths } = await dialog.showOpenDialog({
    title: "Import License File",
    filters: [{ name: "License JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });

  if (!filePaths || filePaths.length === 0) {
    return {
      success: false,
      status: getLicenseStatus(),
      error: "License import cancelled.",
    };
  }

  try {
    const sourcePath = filePaths[0]!;
    const stats = fs.statSync(sourcePath);

    if (!stats.isFile() || stats.size > maxLicenseFileBytes) {
      throw new Error("License file is too large or invalid.");
    }

    const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as unknown;
    const verification = verifyPaidLicenseDocument(parsed, {
      machineCode: machineCodeResult.machineCode,
      publicKeys: licensePublicKeys,
    });

    if (!verification.ok) {
      throw new Error(getLicenseImportError(verification.reason));
    }

    atomicWriteJson(getLicenseFilePath(), parsed);
    const status = getLicenseStatus();

    return {
      success: true,
      status,
    };
  } catch (error) {
    return {
      success: false,
      status: getLicenseStatus(),
      error: error instanceof Error ? error.message : "License import failed.",
    };
  }
}

export function getLicenseFilePath(): string {
  return path.join(getUserDataPath(), licenseFileName);
}

export function getTrialFilePath(): string {
  return path.join(getUserDataPath(), trialFileName);
}

export function getTrialIssuedMarkerFilePath(): string {
  return path.join(getUserDataPath(), trialIssuedMarkerFileName);
}

export function getCurrentMachineCode(): string {
  cachedMachineCode ??= calculateMachineCode(readMachineGuid());

  return cachedMachineCode;
}

function tryGetCurrentMachineCode():
  | { ok: true; machineCode: string }
  | { ok: false; error: Error } {
  try {
    return { ok: true, machineCode: getCurrentMachineCode() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error("Machine code unavailable."),
    };
  }
}

function readAndVerifyLicense(machineCode: string, now: Date) {
  const filePath = getLicenseFilePath();

  if (!fs.existsSync(filePath)) {
    return { ok: false as const, reason: "license-missing" as const };
  }

  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > maxLicenseFileBytes) {
      return { ok: false as const, reason: "license-invalid" as const };
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;

    return verifyPaidLicenseDocument(parsed, {
      machineCode,
      now,
      publicKeys: licensePublicKeys,
    });
  } catch {
    return { ok: false as const, reason: "license-invalid" as const };
  }
}

function readOrCreateTrial(machineCode: string, now: Date) {
  const filePath = getTrialFilePath();
  const markerPath = getTrialIssuedMarkerFilePath();
  const markerResult = readTrialIssuedMarker(machineCode);

  if (!fs.existsSync(filePath)) {
    if (markerResult.exists) {
      return {
        ok: false as const,
        record: null,
        reason: markerResult.ok ? "trial-missing" as const : markerResult.reason,
      };
    }

    const record = createTrialRecord({ machineCode, now });
    const marker = createTrialIssuedMarker({
      machineCode,
      issuedAt: record.startedAt,
      markerId: record.trialId,
    });
    atomicWriteJson(filePath, record);
    atomicWriteJson(markerPath, marker);

    return { ok: true as const, record, updatedRecord: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const result = evaluateTrialRecord(parsed, { machineCode, now });

    if (!result.ok) {
      return result;
    }

    if (markerResult.exists && !markerResult.ok) {
      return {
        ok: false as const,
        record: result.record,
        reason: markerResult.reason,
      };
    }

    if (!markerResult.exists) {
      const marker = createTrialIssuedMarker({
        machineCode,
        issuedAt: result.record.startedAt,
        markerId: result.record.trialId,
      });
      atomicWriteJson(markerPath, marker);
    }

    if (result.ok && result.updatedRecord) {
      atomicWriteJson(filePath, result.updatedRecord);
    }

    return result;
  } catch {
    return { ok: false as const, record: null, reason: "trial-invalid" as const };
  }
}

function readTrialIssuedMarker(machineCode: string):
  | { exists: false }
  | { exists: true; ok: true; marker: TrialIssuedMarker }
  | {
      exists: true;
      ok: false;
      marker: TrialIssuedMarker | null;
      reason: "trial-invalid" | "trial-wrong-machine";
    } {
  const filePath = getTrialIssuedMarkerFilePath();

  if (!fs.existsSync(filePath)) {
    return { exists: false };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const result = evaluateTrialIssuedMarker(parsed, { machineCode });

    if (result.ok) {
      return { exists: true, ok: true, marker: result.marker };
    }

    return {
      exists: true,
      ok: false,
      marker: result.marker,
      reason: result.reason === "trial-wrong-machine" ? "trial-wrong-machine" : "trial-invalid",
    };
  } catch {
    return { exists: true, ok: false, marker: null, reason: "trial-invalid" };
  }
}

function readMachineGuid(): string {
  const override = process.env.RENTAL_APP_MACHINE_GUID;

  if (override?.trim()) {
    return override.trim();
  }

  if (process.platform !== "win32") {
    return `dev:${os.hostname()}`;
  }

  const output = execFileSync(
    "reg.exe",
    ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const match = /MachineGuid\s+REG_\w+\s+([^\r\n]+)/i.exec(output);

  if (!match?.[1]) {
    throw new Error("Windows MachineGuid could not be read.");
  }

  return match[1].trim();
}

function getUserDataPath(): string {
  const userDataPath = process.env.RENTAL_APP_USER_DATA_DIR
    ? path.resolve(process.env.RENTAL_APP_USER_DATA_DIR)
    : app.getPath("userData");

  fs.mkdirSync(userDataPath, { recursive: true });

  return userDataPath;
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function getMachineCodeUnavailableStatus(): LicenseStatus {
  return {
    mode: "readonly",
    canWrite: false,
    machineCode: null,
    license: null,
    trial: null,
    reason: "machine-code-unavailable",
    message: "This computer's machine code could not be read. Please check Windows permissions or contact support.",
  };
}

function toLicenseInfo(payload: {
  customerName: string;
  expiresAt: string | null;
  issuedAt: string;
  licenseId: string;
}): LicenseInfo {
  return {
    licenseId: payload.licenseId,
    customerName: payload.customerName,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  };
}

function toTrialInfo(record: TrialRecord, now: Date): TrialInfo {
  return {
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    daysRemaining: calculateTrialDaysRemaining(record.expiresAt, now),
  };
}

function getLicenseImportError(reason: string): string {
  if (reason === "license-expired") {
    return "License file has expired.";
  }

  return "License file is invalid for this computer.";
}
