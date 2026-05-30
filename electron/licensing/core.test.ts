import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  calculateMachineCode,
  createTrialIssuedMarker,
  createTrialRecord,
  evaluateTrialIssuedMarker,
  evaluateTrialRecord,
  signPaidLicensePayload,
  signTrialIssuedMarker,
  signTrialRecord,
  trialDurationMs,
  verifyPaidLicenseDocument,
  type PaidLicensePayload,
} from "./core";

const keyId = "test-key";
const productId = "arak-rental-windows";

function createKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function createPayload(machineCode = calculateMachineCode("machine-a")): PaidLicensePayload {
  return {
    licenseId: "LIC-001",
    customerName: "Customer Name",
    productId,
    machineCode,
    issuedAt: "2026-05-24T00:00:00.000Z",
    expiresAt: null,
  };
}

describe("paid license verification", () => {
  it("verifies a valid license", () => {
    const keys = createKeys();
    const payload = createPayload();
    const license = signPaidLicensePayload(payload, {
      keyId,
      privateKeyPem: keys.privateKeyPem,
    });

    expect(
      verifyPaidLicenseDocument(license, {
        machineCode: payload.machineCode,
        publicKeys: { [keyId]: keys.publicKeyPem },
      }),
    ).toEqual({ ok: true, payload });
  });

  it("fails when the payload is changed after signing", () => {
    const keys = createKeys();
    const payload = createPayload();
    const license = signPaidLicensePayload(payload, {
      keyId,
      privateKeyPem: keys.privateKeyPem,
    });

    expect(
      verifyPaidLicenseDocument(
        {
          ...license,
          payload: {
            ...license.payload,
            customerName: "Changed Customer",
          },
        },
        {
          machineCode: payload.machineCode,
          publicKeys: { [keyId]: keys.publicKeyPem },
        },
      ),
    ).toEqual({ ok: false, reason: "license-invalid" });
  });

  it("fails for wrong machine, wrong product, expired, malformed, unknown key, and missing fields", () => {
    const keys = createKeys();
    const payload = createPayload();
    const license = signPaidLicensePayload(payload, {
      keyId,
      privateKeyPem: keys.privateKeyPem,
    });
    const publicKeys = { [keyId]: keys.publicKeyPem };

    expect(
      verifyPaidLicenseDocument(license, {
        machineCode: calculateMachineCode("machine-b"),
        publicKeys,
      }),
    ).toEqual({ ok: false, reason: "license-invalid" });

    expect(
      verifyPaidLicenseDocument(
        signPaidLicensePayload(
          { ...payload, productId: "other-product" },
          { keyId, privateKeyPem: keys.privateKeyPem },
        ),
        { machineCode: payload.machineCode, publicKeys },
      ),
    ).toEqual({ ok: false, reason: "license-invalid" });

    expect(
      verifyPaidLicenseDocument(
        signPaidLicensePayload(
          { ...payload, expiresAt: "2026-05-23T00:00:00.000Z" },
          { keyId, privateKeyPem: keys.privateKeyPem },
        ),
        {
          machineCode: payload.machineCode,
          now: new Date("2026-05-24T00:00:00.000Z"),
          publicKeys,
        },
      ),
    ).toEqual({ ok: false, reason: "license-expired" });

    expect(
      verifyPaidLicenseDocument("{bad json", {
        machineCode: payload.machineCode,
        publicKeys,
      }),
    ).toEqual({ ok: false, reason: "license-invalid" });

    expect(
      verifyPaidLicenseDocument({ ...license, keyId: "unknown" }, {
        machineCode: payload.machineCode,
        publicKeys,
      }),
    ).toEqual({ ok: false, reason: "license-invalid" });

    expect(
      verifyPaidLicenseDocument(
        {
          ...license,
          payload: {
            licenseId: "LIC-001",
          },
        },
        {
          machineCode: payload.machineCode,
          publicKeys,
        },
      ),
    ).toEqual({ ok: false, reason: "license-invalid" });
  });
});

describe("trial evaluation", () => {
  it("creates a 15-day trial and allows active trial writes", () => {
    const now = new Date("2026-05-24T00:00:00.000Z");
    const machineCode = calculateMachineCode("machine-a");
    const trial = createTrialRecord({ machineCode, now, trialId: "11111111-1111-4111-8111-111111111111" });

    expect(new Date(trial.expiresAt).getTime() - now.getTime()).toBe(trialDurationMs);
    expect(
      evaluateTrialRecord(trial, {
        machineCode,
        now: new Date("2026-05-25T00:00:00.000Z"),
      }).ok,
    ).toBe(true);
  });

  it("expires, rejects wrong-machine and edited trial files, and rejects malformed files", () => {
    const machineCode = calculateMachineCode("machine-a");
    const trial = createTrialRecord({
      machineCode,
      now: new Date("2026-05-24T00:00:00.000Z"),
      trialId: "11111111-1111-4111-8111-111111111111",
    });

    expect(
      evaluateTrialRecord(trial, {
        machineCode,
        now: new Date("2026-06-08T00:00:01.000Z"),
      }),
    ).toMatchObject({ ok: false, reason: "trial-expired" });

    expect(
      evaluateTrialRecord(trial, {
        machineCode: calculateMachineCode("machine-b"),
        now: new Date("2026-05-25T00:00:00.000Z"),
      }),
    ).toMatchObject({ ok: false, reason: "trial-wrong-machine" });

    expect(
      evaluateTrialRecord(
        {
          ...trial,
          expiresAt: "2026-12-31T00:00:00.000Z",
        },
        {
          machineCode,
          now: new Date("2026-05-25T00:00:00.000Z"),
        },
      ),
    ).toMatchObject({ ok: false, reason: "trial-invalid" });

    expect(
      evaluateTrialRecord({ productId }, {
        machineCode,
        now: new Date("2026-05-25T00:00:00.000Z"),
      }),
    ).toEqual({ ok: false, record: null, reason: "trial-invalid" });
  });

  it("handles clock rollback without permanently invalidating the trial", () => {
    const machineCode = calculateMachineCode("machine-a");
    const trial = createTrialRecord({
      machineCode,
      now: new Date("2026-05-24T00:00:00.000Z"),
      trialId: "11111111-1111-4111-8111-111111111111",
    });
    const seenLater = signTrialRecord({
      ...trial,
      lastSeenAt: "2026-05-27T00:00:00.000Z",
    });

    expect(
      evaluateTrialRecord(seenLater, {
        machineCode,
        now: new Date("2026-05-26T18:00:00.000Z"),
      }).ok,
    ).toBe(true);

    expect(
      evaluateTrialRecord(seenLater, {
        machineCode,
        now: new Date("2026-05-26T17:00:00.000Z"),
      }),
    ).toMatchObject({ ok: false, reason: "system-clock-invalid" });
  });

  it("updates lastSeenAt only when current time is valid and newer", () => {
    const machineCode = calculateMachineCode("machine-a");
    const trial = createTrialRecord({
      machineCode,
      now: new Date("2026-05-24T00:00:00.000Z"),
      trialId: "11111111-1111-4111-8111-111111111111",
    });
    const newer = evaluateTrialRecord(trial, {
      machineCode,
      now: new Date("2026-05-24T01:00:00.000Z"),
    });
    const older = evaluateTrialRecord(trial, {
      machineCode,
      now: new Date("2026-05-23T23:00:00.000Z"),
    });

    expect(newer).toMatchObject({ ok: true });
    expect(newer.ok && newer.updatedRecord?.lastSeenAt).toBe("2026-05-24T01:00:00.000Z");
    expect(older).toMatchObject({ ok: true, updatedRecord: null });
  });

  it("binds the trial-issued marker to the same machine with HMAC integrity", () => {
    const machineCode = calculateMachineCode("machine-a");
    const marker = createTrialIssuedMarker({
      machineCode,
      issuedAt: "2026-05-24T00:00:00.000Z",
      markerId: "11111111-1111-4111-8111-111111111111",
    });

    expect(evaluateTrialIssuedMarker(marker, { machineCode })).toEqual({
      ok: true,
      marker,
    });
    expect(
      evaluateTrialIssuedMarker(marker, {
        machineCode: calculateMachineCode("machine-b"),
      }),
    ).toMatchObject({ ok: false, reason: "trial-wrong-machine" });
    expect(
      evaluateTrialIssuedMarker(
        {
          ...marker,
          issuedAt: "2026-05-25T00:00:00.000Z",
        },
        { machineCode },
      ),
    ).toMatchObject({ ok: false, reason: "trial-invalid" });
    expect(
      evaluateTrialIssuedMarker(
        signTrialIssuedMarker({
          ...marker,
          issuedAt: "not a date",
        }),
        { machineCode },
      ),
    ).toMatchObject({ ok: false, reason: "trial-invalid" });
  });
});
