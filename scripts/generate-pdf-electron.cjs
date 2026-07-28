const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const htmlFile = path.join(rootDir, "docs", "user_guide_ar.html");
const pdfFile = path.join(rootDir, "docs", "USER_GUIDE_AR.pdf");

app.whenReady().then(async () => {
  console.log("Launching Electron for PDF rendering...");

  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  await win.loadFile(htmlFile);

  // Wait 2 seconds for fonts and images to load
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("Printing to A4 PDF...");
  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    margins: {
      top: 0.4,
      bottom: 0.4,
      left: 0.4,
      right: 0.4,
    },
  });

  fs.writeFileSync(pdfFile, pdfBuffer);
  console.log(`PDF User Guide successfully created at: ${pdfFile} (${pdfBuffer.length} bytes)`);

  app.quit();
});
