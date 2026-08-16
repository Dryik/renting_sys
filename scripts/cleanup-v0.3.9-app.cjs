const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { app, dialog, shell } = require("electron");

app.disableHardwareAcceleration();

const helperTitle = "ARAK v0.3.9 Data Cleanup";
const installedDataDirectory = process.env.ARAK_V039_CLEANUP_DATA_DIR ||
  path.join(app.getPath("appData"), "ARAK Rental Desk");

app.whenReady().then(run).catch(showFatalError);

async function run() {
  try {
    const cleanup = await import("./cleanup-v0.3.9.mjs");

    // Used only by the build verification to prove the packaged executable can
    // open a real v0.3.9 database with its bundled native SQLite module.
    const smokeOutputPath = process.env.ARAK_V039_CLEANUP_SMOKE_OUTPUT;
    if (smokeOutputPath) {
      const summary = cleanup.analyzeInstalledData(installedDataDirectory);
      fs.writeFileSync(smokeOutputPath, JSON.stringify(summary), "utf8");
      return;
    }

    if (isRentalDeskRunning(cleanup)) {
      await dialog.showMessageBox({
        type: "warning",
        title: helperTitle,
        message: "أغلق برنامج Rental Desk أولا",
        detail: "Close Rental Desk completely, then open this cleanup tool again.",
        buttons: ["حسنا / OK"],
      });
      return;
    }

    const summary = cleanup.analyzeInstalledData(installedDataDirectory);
    const confirmation = await dialog.showMessageBox({
      type: "warning",
      title: helperTitle,
      message: "حذف جميع بيانات التشغيل مع الاحتفاظ بالعملاء والمركبات؟",
      detail: [
        `سيتم الاحتفاظ بـ ${summary.customersPreserved} عميل و${summary.vehiclesPreserved} مركبة.`,
        `Customers kept: ${summary.customersPreserved}    Vehicles kept: ${summary.vehiclesPreserved}`,
        "",
        "سيتم حذف الإيجارات والمدفوعات والحسابات والصيانة والقروض والمبيعات.",
        "Rentals, payments, accounting, maintenance, loans, and sales will be removed.",
        "",
        "سيتم إنشاء نسخة احتياطية كاملة والتحقق منها قبل الحذف.",
        "A complete verified backup will be created before cleanup.",
      ].join("\n"),
      buttons: ["إلغاء / Cancel", "نسخ احتياطي وتنظيف / Back up and clean"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      checkboxLabel: "أفهم أن بيانات التشغيل ستحذف نهائيا / I understand operational data will be deleted",
      checkboxChecked: false,
    });

    if (confirmation.response !== 1) {
      return;
    }
    if (!confirmation.checkboxChecked) {
      await dialog.showMessageBox({
        type: "info",
        title: helperTitle,
        message: "لم يتم تغيير أي بيانات / No data was changed",
        detail: "Select the confirmation checkbox before running the cleanup.",
        buttons: ["حسنا / OK"],
      });
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const saveResult = await dialog.showSaveDialog({
      title: "حفظ النسخة الاحتياطية / Save safety backup",
      defaultPath: path.join(
        app.getPath("desktop"),
        `ARAK-v0.3.9-before-cleanup-${dateStamp}.zip`,
      ),
      filters: [{ name: "ZIP backup", extensions: ["zip"] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return;
    }

    const result = cleanup.cleanInstalledData(
      installedDataDirectory,
      saveResult.filePath,
    );
    const success = await dialog.showMessageBox({
      type: "info",
      title: helperTitle,
      message: "اكتمل التنظيف بنجاح / Cleanup completed successfully",
      detail: [
        `تم الاحتفاظ بـ ${result.after.customersPreserved} عميل و${result.after.vehiclesPreserved} مركبة.`,
        `Kept ${result.after.customersPreserved} customers and ${result.after.vehiclesPreserved} vehicles.`,
        `تمت إعادة ${result.before.vehiclesResetToAvailable} مركبة مؤجرة إلى متاحة.`,
        `Formerly rented vehicles made available: ${result.before.vehiclesResetToAvailable}`,
        "",
        `النسخة الاحتياطية / Safety backup:\n${result.backupPath}`,
      ].join("\n"),
      buttons: ["حسنا / OK", "فتح مكان النسخة / Show backup"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

    if (success.response === 1) {
      shell.showItemInFolder(result.backupPath);
    }
  } catch (error) {
    await showFatalError(error);
  } finally {
    app.exit(0);
  }
}

function isRentalDeskRunning(cleanup) {
  const taskListPath = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "tasklist.exe",
  );

  try {
    const output = execFileSync(
      taskListPath,
      ["/FI", "IMAGENAME eq ARAK Rental Desk.exe", "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true },
    );
    return cleanup.hasRentalDeskProcess(output);
  } catch {
    // Failure to prove the app is closed must stop a destructive operation.
    return true;
  }
}

async function showFatalError(error) {
  await dialog.showMessageBox({
    type: "error",
    title: helperTitle,
    message: "تعذر تنظيف البيانات / Cleanup could not run",
    detail: error instanceof Error ? error.message : String(error),
    buttons: ["حسنا / OK"],
  });
  app.exit(1);
}
