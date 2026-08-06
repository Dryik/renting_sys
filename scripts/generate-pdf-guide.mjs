import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlFile = path.join(rootDir, "docs", "user_guide_ar.html");
const pdfFile = path.join(rootDir, "docs", "USER_GUIDE_AR.pdf");
const remoteDebuggingPort = 9333;

function getElectronExecutable() {
  const nodeModulesElectron = path.join(
    rootDir,
    "node_modules",
    "electron",
    "dist",
    "electron.exe"
  );
  if (fs.existsSync(nodeModulesElectron)) {
    return nodeModulesElectron;
  }
  return "electron";
}

async function main() {
  console.log("Starting PDF Guide generation...");
  const electronExe = getElectronExecutable();

  const child = spawn(
    electronExe,
    [
      `--remote-debugging-port=${remoteDebuggingPort}`,
      "--headless",
      "--no-sandbox",
      htmlFile,
    ],
    { stdio: "ignore" }
  );

  try {
    const wsUrl = await waitForDebuggerTarget(remoteDebuggingPort);
    const client = await CdpClient.connect(wsUrl);

    await client.send("Page.enable");
    await sleep(2500); // Allow fonts and local images to render

    console.log("Generating A4 PDF via CDP...");
    const pdfResult = await client.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.3,
      marginBottom: 0.3,
      marginLeft: 0.3,
      marginRight: 0.3,
    });

    const buffer = Buffer.from(pdfResult.data, "base64");
    fs.writeFileSync(pdfFile, buffer);
    console.log(`Successfully generated PDF User Guide: ${pdfFile} (${buffer.length} bytes)`);

    client.close();
  } catch (err) {
    console.error("Failed to generate PDF Guide:", err);
  } finally {
    child.kill();
  }
}

async function waitForDebuggerTarget(port) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const pageTarget = targets.find((t) => t.type === "page" || t.type === "iframe") || targets[0];
        if (pageTarget?.webSocketDebuggerUrl) {
          return pageTarget.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Retry
    }
    await sleep(300);
  }
  throw new Error("Could not connect to Electron CDP remote debugger.");
}

class CdpClient {
  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const client = new CdpClient(ws);
      ws.addEventListener("open", () => resolve(client));
      ws.addEventListener("error", reject);
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.callbacks = new Map();

    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data.toString());
      if (message.id && this.callbacks.has(message.id)) {
        const { resolve, reject } = this.callbacks.get(message.id);
        this.callbacks.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result);
        }
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

main();
