import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateMachineCode,
  createTrialIssuedMarker,
  createTrialRecord,
} from "./core";

const electronMock = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

const childProcessMock = vi.hoisted(() => ({
  execFileSync: vi.fn(() => {
    throw new Error("MachineGuid lookup failed.");
  }),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.RENTAL_APP_USER_DATA_DIR),
    getVersion: vi.fn(() => "0.1.0-test"),
  },
  dialog: electronMock,
}));

vi.mock("node:child_process", () => childProcessMock);

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

let tempDir = "";

describe("license service trial marker", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rental-license-service-"));
    process.env.RENTAL_APP_USER_DATA_DIR = tempDir;
    process.env.RENTAL_APP_MACHINE_GUID = "machine-a";
    electronMock.showOpenDialog.mockReset();
    electronMock.showSaveDialog.mockReset();
    childProcessMock.execFileSync.mockClear();
  });

  afterEach(() => {
    delete process.env.RENTAL_APP_USER_DATA_DIR;
    delete process.env.RENTAL_APP_MACHINE_GUID;
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
    fs.rmSync(tempDir, { force: true, recursive: true });
    vi.resetModules();
  });

  it("creates trial.json and trial-issued marker on fresh install and preserves the same trial", async () => {
    const service = await loadService();

    expect(service.getLicenseStatus()).toMatchObject({ mode: "trial", canWrite: true });
    const firstTrial = readJson(service.getTrialFilePath()) as { trialId: string; startedAt: string };

    expect(fs.existsSync(service.getTrialIssuedMarkerFilePath())).toBe(true);
    expect(service.getLicenseStatus()).toMatchObject({ mode: "trial", canWrite: true });
    const secondTrial = readJson(service.getTrialFilePath()) as { trialId: string; startedAt: string };

    expect(secondTrial.trialId).toBe(firstTrial.trialId);
    expect(secondTrial.startedAt).toBe(firstTrial.startedAt);
  });

  it("does not reissue the trial when trial.json is deleted after issuance", async () => {
    const service = await loadService();
    service.getLicenseStatus();
    fs.rmSync(service.getTrialFilePath());

    expect(service.getLicenseStatus()).toMatchObject({
      mode: "readonly",
      canWrite: false,
      reason: "trial-missing",
    });
    expect(fs.existsSync(service.getTrialFilePath())).toBe(false);
  });

  it("treats malformed trial.json with a valid marker as read-only", async () => {
    const service = await loadService();
    service.getLicenseStatus();
    fs.writeFileSync(service.getTrialFilePath(), "{bad json", "utf8");

    expect(service.getLicenseStatus()).toMatchObject({
      mode: "readonly",
      canWrite: false,
      reason: "trial-invalid",
    });
  });

  it("treats expired trial.json with a valid marker as read-only", async () => {
    const service = await loadService();
    const machineCode = calculateMachineCode("machine-a");
    const trial = createTrialRecord({
      machineCode,
      now: new Date("2026-01-01T00:00:00.000Z"),
      trialId: "11111111-1111-4111-8111-111111111111",
    });
    const marker = createTrialIssuedMarker({
      machineCode,
      issuedAt: trial.startedAt,
      markerId: trial.trialId,
    });
    fs.writeFileSync(service.getTrialFilePath(), `${JSON.stringify(trial)}\n`, "utf8");
    fs.writeFileSync(service.getTrialIssuedMarkerFilePath(), `${JSON.stringify(marker)}\n`, "utf8");

    expect(service.getLicenseStatus()).toMatchObject({
      mode: "readonly",
      canWrite: false,
      reason: "trial-expired",
    });
  });

  it("does not create a fresh trial when the marker belongs to another machine", async () => {
    const service = await loadService();
    const machineCode = calculateMachineCode("machine-a");
    const wrongMachineCode = calculateMachineCode("machine-b");
    const trial = createTrialRecord({
      machineCode,
      trialId: "11111111-1111-4111-8111-111111111111",
    });
    const marker = createTrialIssuedMarker({
      machineCode: wrongMachineCode,
      issuedAt: trial.startedAt,
      markerId: trial.trialId,
    });
    fs.writeFileSync(service.getTrialFilePath(), `${JSON.stringify(trial)}\n`, "utf8");
    fs.writeFileSync(service.getTrialIssuedMarkerFilePath(), `${JSON.stringify(marker)}\n`, "utf8");

    expect(service.getLicenseStatus()).toMatchObject({
      mode: "readonly",
      canWrite: false,
      reason: "trial-wrong-machine",
    });
  });

  it("recreates a missing marker from an active machine-bound trial without reissuing the trial", async () => {
    const service = await loadService();
    service.getLicenseStatus();
    const trial = readJson(service.getTrialFilePath()) as { trialId: string };
    fs.rmSync(service.getTrialIssuedMarkerFilePath());

    expect(service.getLicenseStatus()).toMatchObject({ mode: "trial", canWrite: true });
    expect(fs.existsSync(service.getTrialIssuedMarkerFilePath())).toBe(true);
    expect((readJson(service.getTrialFilePath()) as { trialId: string }).trialId).toBe(trial.trialId);
  });

  it("returns read-only status and does not create a trial when MachineGuid cannot be read", async () => {
    delete process.env.RENTAL_APP_MACHINE_GUID;
    forcePlatform("win32");
    const service = await loadService();

    expect(service.getLicenseStatus()).toMatchObject({
      mode: "readonly",
      canWrite: false,
      machineCode: null,
      reason: "machine-code-unavailable",
    });
    expect(fs.existsSync(service.getTrialFilePath())).toBe(false);
    expect(fs.existsSync(service.getTrialIssuedMarkerFilePath())).toBe(false);
  });

  it("does not open a save dialog when MachineGuid is unavailable for license request export", async () => {
    delete process.env.RENTAL_APP_MACHINE_GUID;
    forcePlatform("win32");
    const service = await loadService();

    await expect(service.exportLicenseRequest()).resolves.toMatchObject({
      success: false,
      error: "Machine code unavailable. Cannot export license request.",
    });
    expect(electronMock.showSaveDialog).not.toHaveBeenCalled();
  });
});

async function loadService() {
  vi.resetModules();
  return import("./service");
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function forcePlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value,
  });
}
