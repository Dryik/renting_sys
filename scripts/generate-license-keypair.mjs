#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const outDir = args["out-dir"];
const keyId = args["key-id"] ?? "arak-license-key-2026-01";

if (!outDir) {
  console.error("Usage: node scripts/generate-license-keypair.mjs --out-dir <secure-folder> [--key-id arak-license-key-2026-01]");
  process.exit(1);
}

const resolvedOutDir = path.resolve(outDir);
fs.mkdirSync(resolvedOutDir, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPath = path.join(resolvedOutDir, `${keyId}.private.pem`);
const publicKeyPath = path.join(resolvedOutDir, `${keyId}.public.pem`);

if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
  console.error("Key files already exist. Move them or choose another --key-id.");
  process.exit(1);
}

fs.writeFileSync(
  privateKeyPath,
  privateKey.export({ type: "pkcs8", format: "pem" }),
  { encoding: "utf8", mode: 0o600 },
);
fs.writeFileSync(
  publicKeyPath,
  publicKey.export({ type: "spki", format: "pem" }),
  "utf8",
);

console.log(`Created private key: ${privateKeyPath}`);
console.log(`Created public key: ${publicKeyPath}`);
console.log("Keep the private key outside this repo and outside packaged app files.");
console.log("Copy only the public key into electron/licensing/public-keys.ts before building client installers.");

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
