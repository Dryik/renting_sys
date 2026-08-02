import { app, BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export async function renderHtmlToA4Pdf(htmlContent: string): Promise<Buffer> {
  const renderDirectory = path.join(
    fs.realpathSync.native(app.getPath("temp")),
    "arak-rental-render",
  );
  const htmlPath = path.join(renderDirectory, `${randomUUID()}.html`);
  fs.mkdirSync(renderDirectory, { recursive: true });
  fs.writeFileSync(htmlPath, htmlContent, "utf8");

  const renderWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await renderWindow.loadFile(htmlPath);
    await waitForPrintableResources(renderWindow);
    return await renderWindow.webContents.printToPDF({
      margins: { marginType: "none" },
      pageSize: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });
  } finally {
    if (!renderWindow.isDestroyed()) {
      try {
        await renderWindow.loadURL("about:blank");
      } catch {
        // The window may already be closing during app shutdown.
      }
      renderWindow.destroy();
    }
    await removeTemporaryHtml(htmlPath);
  }
}

async function removeTemporaryHtml(htmlPath: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fs.promises.rm(htmlPath, { force: true });
      return;
    } catch (error) {
      if (attempt === 5) {
        console.error("Failed to remove temporary print HTML:", error);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
}

async function waitForPrintableResources(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`
    (async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }));
    })()
  `);
}
