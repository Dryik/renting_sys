import crypto from "node:crypto";
import { z } from "zod";
import { licenseProductId, type LicenseReadonlyReason } from "../../src/shared/license";

export const trialDurationMs = 15 * 24 * 60 * 60 * 1000;
export const clockRollbackToleranceMs = 6 * 60 * 60 * 1000;
export const defaultTrialIntegritySecret =
  "arak-rental-desk-trial-integrity-v1-local-copy-protection";

const machineCodeSchema = z
  .string()
  .trim()
  .transform(normalizeMachineCode)
  .refine((value) => /^[a-f0-9]{64}$/.test(value), "Machine code is invalid.");

const paidLicensePayloadSchema = z
  .object({
    licenseId: z.string().trim().min(1),
    customerName: z.string().trim().min(1),
    productId: z.string().trim().min(1),
    machineCode: machineCodeSchema,
    issuedAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1).nullable(),
  })
  .strict();

const paidLicenseDocumentSchema = z
  .object({
    keyId: z.string().trim().min(1),
    payload: paidLicensePayloadSchema,
    signature: z
      .string()
      .trim()
      .min(1)
      .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Signature is invalid."),
  })
  .strict();

const trialRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    productId: z.string().trim().min(1),
    machineCode: machineCodeSchema,
    trialId: z.string().uuid(),
    startedAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1),
    lastSeenAt: z.string().trim().min(1),
    integrity: z.string().trim().min(1),
  })
  .strict();

const trialIssuedMarkerSchema = z
  .object({
    schemaVersion: z.literal(1),
    productId: z.string().trim().min(1),
    machineCode: machineCodeSchema,
    issuedAt: z.string().trim().min(1),
    markerId: z.string().uuid(),
    integrity: z.string().trim().min(1),
  })
  .strict();

export type PaidLicensePayload = z.infer<typeof paidLicensePayloadSchema>;

export type PaidLicenseDocument = {
  keyId: string;
  payload: PaidLicensePayload;
  signature: string;
};

export type TrialRecord = z.infer<typeof trialRecordSchema>;

export type TrialIssuedMarker = z.infer<typeof trialIssuedMarkerSchema>;

export type PaidLicenseVerificationResult =
  | {
      ok: true;
      payload: PaidLicensePayload;
    }
  | {
      ok: false;
      reason: LicenseReadonlyReason;
    };

export type TrialEvaluationResult =
  | {
      ok: true;
      record: TrialRecord;
      updatedRecord: TrialRecord | null;
    }
  | {
      ok: false;
      record: TrialRecord | null;
      reason: LicenseReadonlyReason;
    };

export type TrialMarkerEvaluationResult =
  | {
      ok: true;
      marker: TrialIssuedMarker;
    }
  | {
      ok: false;
      marker: TrialIssuedMarker | null;
      reason: LicenseReadonlyReason;
    };

export function calculateMachineCode(machineGuid: string): string {
  return crypto
    .createHash("sha256")
    .update(`arak-rental-v1:${machineGuid.trim()}`)
    .digest("hex");
}

export function normalizeMachineCode(value: string): string {
  return value.replace(/-/g, "").trim().toLowerCase();
}

export function formatMachineCode(value: string): string {
  const normalized = normalizeMachineCode(value).toUpperCase();
  const groups = normalized.match(/.{1,4}/g) ?? [];

  return groups.join("-");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

export function verifyPaidLicenseDocument(
  input: unknown,
  options: {
    machineCode: string;
    now?: Date;
    productId?: string;
    publicKeys: Record<string, string>;
  },
): PaidLicenseVerificationResult {
  const parsed = paidLicenseDocumentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, reason: "license-invalid" };
  }

  const { keyId, payload, signature } = parsed.data;
  const publicKey = options.publicKeys[keyId];

  if (!publicKey) {
    return { ok: false, reason: "license-invalid" };
  }

  if (payload.productId !== (options.productId ?? licenseProductId)) {
    return { ok: false, reason: "license-invalid" };
  }

  if (payload.machineCode !== normalizeMachineCode(options.machineCode)) {
    return { ok: false, reason: "license-invalid" };
  }

  if (!isValidDate(payload.issuedAt)) {
    return { ok: false, reason: "license-invalid" };
  }

  if (payload.expiresAt !== null) {
    if (!isValidDate(payload.expiresAt)) {
      return { ok: false, reason: "license-invalid" };
    }

    const nowTime = (options.now ?? new Date()).getTime();
    if (new Date(payload.expiresAt).getTime() <= nowTime) {
      return { ok: false, reason: "license-expired" };
    }
  }

  const verified = crypto.verify(
    null,
    Buffer.from(canonicalJson(payload), "utf8"),
    publicKey,
    Buffer.from(signature, "base64url"),
  );

  return verified ? { ok: true, payload } : { ok: false, reason: "license-invalid" };
}

export function signPaidLicensePayload(
  payload: PaidLicensePayload,
  options: {
    keyId: string;
    privateKeyPem: string;
  },
): PaidLicenseDocument {
  const normalizedPayload = paidLicensePayloadSchema.parse(payload);
  const signature = crypto
    .sign(
      null,
      Buffer.from(canonicalJson(normalizedPayload), "utf8"),
      options.privateKeyPem,
    )
    .toString("base64url");

  return {
    keyId: options.keyId,
    payload: normalizedPayload,
    signature,
  };
}

export function createTrialRecord(input: {
  machineCode: string;
  now?: Date;
  productId?: string;
  secret?: string;
  trialId?: string;
}): TrialRecord {
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  const recordWithoutIntegrity = {
    schemaVersion: 1 as const,
    productId: input.productId ?? licenseProductId,
    machineCode: normalizeMachineCode(input.machineCode),
    trialId: input.trialId ?? crypto.randomUUID(),
    startedAt,
    expiresAt: new Date(now.getTime() + trialDurationMs).toISOString(),
    lastSeenAt: startedAt,
  };

  return {
    ...recordWithoutIntegrity,
    integrity: calculateHmacIntegrity(
      recordWithoutIntegrity,
      input.secret ?? defaultTrialIntegritySecret,
    ),
  };
}

export function createTrialIssuedMarker(input: {
  machineCode: string;
  issuedAt: string;
  markerId: string;
  productId?: string;
  secret?: string;
}): TrialIssuedMarker {
  const markerWithoutIntegrity = {
    schemaVersion: 1 as const,
    productId: input.productId ?? licenseProductId,
    machineCode: normalizeMachineCode(input.machineCode),
    issuedAt: input.issuedAt,
    markerId: input.markerId,
  };

  return signTrialIssuedMarker(
    markerWithoutIntegrity,
    input.secret ?? defaultTrialIntegritySecret,
  );
}

export function evaluateTrialIssuedMarker(
  input: unknown,
  options: {
    machineCode: string;
    productId?: string;
    secret?: string;
  },
): TrialMarkerEvaluationResult {
  const parsed = trialIssuedMarkerSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, marker: null, reason: "trial-invalid" };
  }

  const marker = parsed.data;
  const secret = options.secret ?? defaultTrialIntegritySecret;

  if (!verifyTrialIssuedMarkerIntegrity(marker, secret)) {
    return { ok: false, marker, reason: "trial-invalid" };
  }

  if (marker.productId !== (options.productId ?? licenseProductId)) {
    return { ok: false, marker, reason: "trial-invalid" };
  }

  if (marker.machineCode !== normalizeMachineCode(options.machineCode)) {
    return { ok: false, marker, reason: "trial-wrong-machine" };
  }

  if (!isValidDate(marker.issuedAt)) {
    return { ok: false, marker, reason: "trial-invalid" };
  }

  return { ok: true, marker };
}

export function evaluateTrialRecord(
  input: unknown,
  options: {
    machineCode: string;
    now?: Date;
    productId?: string;
    secret?: string;
  },
): TrialEvaluationResult {
  const parsed = trialRecordSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, record: null, reason: "trial-invalid" };
  }

  const record = parsed.data;
  const secret = options.secret ?? defaultTrialIntegritySecret;

  if (!verifyTrialIntegrity(record, secret)) {
    return { ok: false, record, reason: "trial-invalid" };
  }

  if (record.productId !== (options.productId ?? licenseProductId)) {
    return { ok: false, record, reason: "trial-invalid" };
  }

  if (record.machineCode !== normalizeMachineCode(options.machineCode)) {
    return { ok: false, record, reason: "trial-wrong-machine" };
  }

  if (
    !isValidDate(record.startedAt) ||
    !isValidDate(record.expiresAt) ||
    !isValidDate(record.lastSeenAt)
  ) {
    return { ok: false, record, reason: "trial-invalid" };
  }

  const now = options.now ?? new Date();
  const nowTime = now.getTime();
  const lastSeenTime = new Date(record.lastSeenAt).getTime();

  if (nowTime + clockRollbackToleranceMs < lastSeenTime) {
    return { ok: false, record, reason: "system-clock-invalid" };
  }

  if (new Date(record.expiresAt).getTime() <= nowTime) {
    return { ok: false, record, reason: "trial-expired" };
  }

  if (nowTime > lastSeenTime) {
    const updatedRecord = signTrialRecord(
      {
        ...record,
        lastSeenAt: now.toISOString(),
      },
      secret,
    );

    return { ok: true, record, updatedRecord };
  }

  return { ok: true, record, updatedRecord: null };
}

export function calculateTrialDaysRemaining(expiresAt: string, now = new Date()): number {
  const remainingMs = new Date(expiresAt).getTime() - now.getTime();

  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export function signTrialRecord(
  record: Omit<TrialRecord, "integrity"> & { integrity?: string },
  secret = defaultTrialIntegritySecret,
): TrialRecord {
  const { integrity: _integrity, ...recordWithoutIntegrity } = record;
  void _integrity;

  return {
    ...recordWithoutIntegrity,
    integrity: calculateHmacIntegrity(recordWithoutIntegrity, secret),
  };
}

export function signTrialIssuedMarker(
  marker: Omit<TrialIssuedMarker, "integrity"> & { integrity?: string },
  secret = defaultTrialIntegritySecret,
): TrialIssuedMarker {
  const { integrity: _integrity, ...markerWithoutIntegrity } = marker;
  void _integrity;

  return {
    ...markerWithoutIntegrity,
    integrity: calculateHmacIntegrity(markerWithoutIntegrity, secret),
  };
}

function verifyTrialIntegrity(record: TrialRecord, secret: string): boolean {
  const expected = Buffer.from(signTrialRecord(record, secret).integrity, "utf8");
  const actual = Buffer.from(record.integrity, "utf8");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function verifyTrialIssuedMarkerIntegrity(
  marker: TrialIssuedMarker,
  secret: string,
): boolean {
  const expected = Buffer.from(signTrialIssuedMarker(marker, secret).integrity, "utf8");
  const actual = Buffer.from(marker.integrity, "utf8");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function calculateHmacIntegrity(record: unknown, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(canonicalJson(record))
    .digest("base64url");
}

function isValidDate(value: string): boolean {
  const time = new Date(value).getTime();

  return Number.isFinite(time);
}
