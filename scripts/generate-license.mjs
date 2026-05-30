#!/usr/bin/env node
import { sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const productId = "arak-rental-windows";
const args = parseArgs(process.argv.slice(2));
const requestPath = args.request;
const privateKeyPath = args["private-key"];
const outPath = args.out;
const keyId = args["key-id"] ?? "arak-license-key-2026-01";
const licenseId = args["license-id"];
const customerName = args.customer;
const expiresAt = args["expires-at"] ?? null;

if (!requestPath || !privateKeyPath || !outPath || !licenseId || !customerName) {
  console.error([
    "Usage:",
    "node scripts/generate-license.mjs",
    "  --request <request-json>",
    "  --private-key <secure-private-key-pem>",
    "  --license-id <LIC-001>",
    "  --customer <Customer Name>",
    "  --out <license-json>",
    "  [--expires-at 2027-05-24T00:00:00.000Z]",
    "  [--key-id arak-license-key-2026-01]",
  ].join("\n"));
  process.exit(1);
}

const request = JSON.parse(fs.readFileSync(path.resolve(requestPath), "utf8"));
const privateKeyPem = fs.readFileSync(path.resolve(privateKeyPath), "utf8");
const normalizedMachineCode = normalizeMachineCode(String(request.machineCode ?? ""));

if (request.productId !== productId) {
  throw new Error(`Request productId must be ${productId}.`);
}

if (!/^[a-f0-9]{64}$/.test(normalizedMachineCode)) {
  throw new Error("Request machineCode is invalid.");
}

if (expiresAt !== null && Number.isNaN(new Date(expiresAt).getTime())) {
  throw new Error("expiresAt must be an ISO date or omitted.");
}

const payload = {
  licenseId,
  customerName,
  productId,
  machineCode: normalizedMachineCode,
  issuedAt: new Date().toISOString(),
  expiresAt,
};
const signature = sign(
  null,
  Buffer.from(canonicalJson(payload), "utf8"),
  privateKeyPem,
).toString("base64url");
const license = {
  keyId,
  payload,
  signature,
};

const resolvedOutPath = path.resolve(outPath);
fs.mkdirSync(path.dirname(resolvedOutPath), { recursive: true });
fs.writeFileSync(resolvedOutPath, `${JSON.stringify(license, null, 2)}\n`, "utf8");
console.log(`Created license file: ${resolvedOutPath}`);

function normalizeMachineCode(value) {
  return value.replace(/-/g, "").trim().toLowerCase();
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  return `{${Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];

    if (!item?.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const next = values[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}
