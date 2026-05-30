#!/usr/bin/env node
import { sign } from "node:crypto";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productId = "arak-rental-windows";
const defaultKeyId = "arak-license-key-2026-01";
const defaultPrivateKeyPath = `C:\\secure\\arak-license-keys\\${defaultKeyId}.private.pem`;
const defaultOutputDir = "C:\\secure\\issued-licenses";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;

app.whenReady().then(() => {
  registerIpcHandlers();
  mainWindow = createWindow();

  if (process.env.LICENSE_GENERATOR_SMOKE_TEST === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      console.log("License generator smoke test: window loaded.");
      app.quit();
    });
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

function createWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 780,
    minHeight: 640,
    title: "ARAK License Generator",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "generate-license-preload.cjs"),
    },
  });

  window.setMenuBarVisibility(false);
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderHtml())}`);

  return window;
}

function registerIpcHandlers() {
  ipcMain.handle("license-generator:select-request", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select License Request",
      properties: ["openFile"],
      filters: [{ name: "License request JSON", extensions: ["json"] }],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false };
    }

    const filePath = result.filePaths[0];
    return {
      ok: true,
      filePath,
      request: readLicenseRequest(filePath),
    };
  });

  ipcMain.handle("license-generator:select-private-key", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select Private Signing Key",
      defaultPath: fs.existsSync(defaultPrivateKeyPath)
        ? defaultPrivateKeyPath
        : "C:\\secure",
      properties: ["openFile"],
      filters: [{ name: "Private key PEM", extensions: ["pem", "key"] }],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false };
    }

    return { ok: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle("license-generator:select-output-dir", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select License Output Folder",
      defaultPath: defaultOutputDir,
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false };
    }

    return { ok: true, dirPath: result.filePaths[0] };
  });

  ipcMain.handle("license-generator:generate-license", (_event, input) => {
    return generateLicense(input);
  });

  ipcMain.handle("license-generator:show-license-in-folder", (_event, filePath) => {
    if (typeof filePath === "string" && filePath.trim()) {
      shell.showItemInFolder(path.resolve(filePath));
    }

    return { ok: true };
  });
}

function generateLicense(input) {
  const requestPath = requireText(input?.requestPath, "License request is required.");
  const privateKeyPath = requireText(input?.privateKeyPath, "Private key is required.");
  const outputDir = requireText(input?.outputDir, "Output folder is required.");
  const keyId = requireText(input?.keyId || defaultKeyId, "Key ID is required.");
  const licenseId = requireText(input?.licenseId, "License ID is required.");
  const customerName = requireText(input?.customerName, "Customer name is required.");
  const expiresAt = normalizeExpiresAt(input?.expiresAt);

  const request = readLicenseRequest(requestPath);
  const privateKeyPem = fs.readFileSync(path.resolve(privateKeyPath), "utf8");
  const normalizedMachineCode = normalizeMachineCode(String(request.machineCode ?? ""));

  if (request.productId !== productId) {
    throw new Error(`Request productId must be ${productId}.`);
  }

  if (!/^[a-f0-9]{64}$/.test(normalizedMachineCode)) {
    throw new Error("Request machineCode is invalid.");
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
  const outPath = path.join(path.resolve(outputDir), `${sanitizeFileName(licenseId)}.json`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(license, null, 2)}\n`, "utf8");

  return {
    ok: true,
    filePath: outPath,
    machineCode: request.machineCode,
    customerName,
    licenseId,
    expiresAt,
  };
}

function readLicenseRequest(filePath) {
  const resolvedPath = path.resolve(filePath);
  const stats = fs.statSync(resolvedPath);

  if (stats.size > 1024 * 1024) {
    throw new Error("License request is too large.");
  }

  const request = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const normalizedMachineCode = normalizeMachineCode(String(request.machineCode ?? ""));

  if (request.productId !== productId) {
    throw new Error(`Request productId must be ${productId}.`);
  }

  if (!/^[a-f0-9]{64}$/.test(normalizedMachineCode)) {
    throw new Error("Request machineCode is invalid.");
  }

  return {
    productId: request.productId,
    appVersion: request.appVersion ?? null,
    machineCode: formatMachineCode(normalizedMachineCode),
    requestedAt: request.requestedAt ?? null,
  };
}

function normalizeExpiresAt(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!trimmed) {
    return null;
  }

  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : trimmed;
  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Expiry date must be empty, YYYY-MM-DD, or a valid ISO date.");
  }

  return date.toISOString();
}

function requireText(value, message) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function normalizeMachineCode(value) {
  return value.replace(/-/g, "").trim().toLowerCase();
}

function formatMachineCode(value) {
  const groups = normalizeMachineCode(value).toUpperCase().match(/.{1,4}/g) ?? [];

  return groups.join("-");
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

function sanitizeFileName(value) {
  const withoutControlCharacters = Array.from(value)
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("");

  return withoutControlCharacters.replace(/[<>:"/\\|?*]/g, "_").trim() || "license";
}

function renderHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ARAK License Generator</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", Arial, sans-serif;
        color: #18212f;
        background: #f5f7fb;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #f5f7fb;
      }

      main {
        max-width: 940px;
        margin: 0 auto;
        padding: 28px;
      }

      header {
        margin-bottom: 22px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        letter-spacing: 0;
      }

      p {
        margin: 0;
        color: #59657a;
        line-height: 1.5;
      }

      .panel {
        border: 1px solid #d9e0ec;
        border-radius: 8px;
        background: #ffffff;
        padding: 18px;
        margin-bottom: 16px;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: end;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      label {
        display: block;
        font-weight: 650;
        font-size: 13px;
        margin-bottom: 7px;
      }

      input {
        width: 100%;
        height: 40px;
        border: 1px solid #c8d1df;
        border-radius: 6px;
        padding: 0 10px;
        font: inherit;
        color: #1d2736;
        background: #ffffff;
      }

      input[readonly] {
        background: #f8fafc;
        color: #4a5568;
      }

      button {
        height: 40px;
        border: 1px solid #b9c4d3;
        border-radius: 6px;
        padding: 0 14px;
        font: inherit;
        font-weight: 650;
        color: #1f2a3a;
        background: #ffffff;
        cursor: pointer;
      }

      button.primary {
        border-color: #0f766e;
        color: #ffffff;
        background: #0f766e;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .request-preview {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
        padding: 12px;
        border-radius: 6px;
        background: #f8fafc;
      }

      .preview-item span {
        display: block;
        color: #69758a;
        font-size: 12px;
        margin-bottom: 3px;
      }

      .preview-item strong {
        display: block;
        overflow-wrap: anywhere;
        font-size: 13px;
      }

      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 16px;
      }

      .message {
        margin-top: 14px;
        padding: 12px;
        border-radius: 6px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .message.success {
        border: 1px solid #9bd6bb;
        color: #14532d;
        background: #ecfdf3;
      }

      .message.error {
        border: 1px solid #fecaca;
        color: #991b1b;
        background: #fef2f2;
      }

      .note {
        margin-top: 10px;
        font-size: 13px;
      }

      @media (max-width: 760px) {
        main {
          padding: 18px;
        }

        .grid,
        .form-grid,
        .request-preview {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>ARAK License Generator</h1>
        <p>Create signed offline license files from customer license requests. This tool does not store the private key path or send anything online.</p>
      </header>

      <section class="panel">
        <div class="grid">
          <div>
            <label for="requestPath">License request JSON</label>
            <input id="requestPath" readonly placeholder="Select the request exported from the client PC" />
          </div>
          <button id="selectRequest">Select Request</button>
        </div>
        <div id="requestPreview" class="request-preview" hidden>
          <div class="preview-item">
            <span>Product</span>
            <strong id="previewProduct"></strong>
          </div>
          <div class="preview-item">
            <span>App Version</span>
            <strong id="previewVersion"></strong>
          </div>
          <div class="preview-item">
            <span>Machine Code</span>
            <strong id="previewMachine"></strong>
          </div>
          <div class="preview-item">
            <span>Requested At</span>
            <strong id="previewRequestedAt"></strong>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="grid">
          <div>
            <label for="privateKeyPath">Private signing key</label>
            <input id="privateKeyPath" readonly value="${defaultPrivateKeyPath}" />
          </div>
          <button id="selectPrivateKey">Select Private Key</button>
        </div>
        <p class="note">Keep this key outside the repo, outside installers, and away from client machines.</p>
      </section>

      <section class="panel">
        <div class="form-grid">
          <div>
            <label for="customerName">Customer name</label>
            <input id="customerName" placeholder="Customer Name" />
          </div>
          <div>
            <label for="licenseId">License ID</label>
            <input id="licenseId" placeholder="LIC-001" />
          </div>
          <div>
            <label for="keyId">Key ID</label>
            <input id="keyId" value="${defaultKeyId}" />
          </div>
          <div>
            <label for="expiresAt">Expiry date, optional</label>
            <input id="expiresAt" type="date" />
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="grid">
          <div>
            <label for="outputDir">Output folder</label>
            <input id="outputDir" readonly value="${defaultOutputDir}" />
          </div>
          <button id="selectOutputDir">Select Folder</button>
        </div>
        <div class="actions">
          <button id="generate" class="primary">Generate License</button>
          <button id="openFolder" disabled>Open Output Folder</button>
        </div>
        <div id="message" class="message" hidden></div>
      </section>
    </main>

    <script>
      const state = {
        lastLicensePath: "",
      };
      const fields = {
        requestPath: document.querySelector("#requestPath"),
        privateKeyPath: document.querySelector("#privateKeyPath"),
        outputDir: document.querySelector("#outputDir"),
        customerName: document.querySelector("#customerName"),
        licenseId: document.querySelector("#licenseId"),
        keyId: document.querySelector("#keyId"),
        expiresAt: document.querySelector("#expiresAt"),
        message: document.querySelector("#message"),
        preview: document.querySelector("#requestPreview"),
        previewProduct: document.querySelector("#previewProduct"),
        previewVersion: document.querySelector("#previewVersion"),
        previewMachine: document.querySelector("#previewMachine"),
        previewRequestedAt: document.querySelector("#previewRequestedAt"),
        openFolder: document.querySelector("#openFolder"),
      };

      document.querySelector("#selectRequest").addEventListener("click", async () => {
        await runAction(async () => {
          const result = await window.licenseGenerator.selectRequest();

          if (!result.ok) {
            return;
          }

          fields.requestPath.value = result.filePath;
          fields.previewProduct.textContent = result.request.productId;
          fields.previewVersion.textContent = result.request.appVersion || "Not provided";
          fields.previewMachine.textContent = result.request.machineCode;
          fields.previewRequestedAt.textContent = result.request.requestedAt || "Not provided";
          fields.preview.hidden = false;
        });
      });

      document.querySelector("#selectPrivateKey").addEventListener("click", async () => {
        await runAction(async () => {
          const result = await window.licenseGenerator.selectPrivateKey();

          if (result.ok) {
            fields.privateKeyPath.value = result.filePath;
          }
        });
      });

      document.querySelector("#selectOutputDir").addEventListener("click", async () => {
        await runAction(async () => {
          const result = await window.licenseGenerator.selectOutputDir();

          if (result.ok) {
            fields.outputDir.value = result.dirPath;
          }
        });
      });

      document.querySelector("#generate").addEventListener("click", async () => {
        await runAction(async () => {
          const result = await window.licenseGenerator.generateLicense({
            requestPath: fields.requestPath.value,
            privateKeyPath: fields.privateKeyPath.value,
            outputDir: fields.outputDir.value,
            customerName: fields.customerName.value,
            licenseId: fields.licenseId.value,
            keyId: fields.keyId.value,
            expiresAt: fields.expiresAt.value,
          });

          state.lastLicensePath = result.filePath;
          fields.openFolder.disabled = false;
          showMessage("success", "Created license: " + result.filePath);
        });
      });

      fields.openFolder.addEventListener("click", async () => {
        if (!state.lastLicensePath) {
          return;
        }

        await window.licenseGenerator.showLicenseInFolder(state.lastLicensePath);
      });

      async function runAction(action) {
        try {
          clearMessage();
          await action();
        } catch (error) {
          showMessage("error", error instanceof Error ? error.message : String(error));
        }
      }

      function clearMessage() {
        fields.message.hidden = true;
        fields.message.textContent = "";
        fields.message.className = "message";
      }

      function showMessage(type, text) {
        fields.message.hidden = false;
        fields.message.textContent = text;
        fields.message.className = "message " + type;
      }
    </script>
  </body>
</html>`;
}
