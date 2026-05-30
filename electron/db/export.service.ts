import ExcelJS from "exceljs";
import { dialog } from "electron";
import fs from "node:fs";
import type { ReportExportRequest } from "../../src/shared/reports";
import { formatExpiringDocumentType } from "../../src/shared/reports";
import { requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { getDatabase } from "./database";
import {
  getActiveRentals,
  getCancelledRentals,
  getDailyClosing,
  getDailyPayments,
  getDeposits,
  getExpiringDocuments,
  getOutstandingBalances,
  getOverdueRentals,
  getPaymentVoids,
  getReturnedRentals,
  getVehicleIncome,
  getVehicleNetSummary,
  getVehicleSales,
  getVehicleUtilization,
} from "./reports.service";
import { listAccountingTransactions, listExpenses } from "./accounting.service";
import { getShopSettings } from "./settings.service";

type ExportCell = string | number | boolean | null;
type ExportTable = {
  name: string;
  headers: string[];
  rows: ExportCell[][];
};

export async function exportReport(
  request: ReportExportRequest,
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  requirePermissionForCurrentSession("reports.export");

  try {
    const table = buildExportTable(request);
    const extension = request.format === "xlsx" ? "xlsx" : "csv";
    const { filePath } = await dialog.showSaveDialog({
      title: "Export Report",
      defaultPath: `${table.name}.${extension}`,
      filters: [
        request.format === "xlsx"
          ? { name: "Excel Workbook", extensions: ["xlsx"] }
          : { name: "CSV", extensions: ["csv"] },
      ],
    });

    if (!filePath) {
      return { success: false, error: "Export cancelled by user." };
    }

    if (request.format === "xlsx") {
      await writeXlsx(filePath, table);
    } else {
      writeCsv(filePath, table);
    }
    logAuditEvent(getDatabase(), {
      action: "report.exported",
      entityType: "report",
      entityLabel: request.type,
      summaryAr: "تم تصدير تقرير",
      summaryEn: "Report was exported.",
      metadata: { type: request.type, format: request.format, filePath },
    });

    return { success: true, filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Report export failed.",
    };
  }
}

function buildExportTable(request: ReportExportRequest): ExportTable {
  if (request.type === "activeRentals") {
    return rentalsTable("active-rentals", getActiveRentals());
  }

  if (request.type === "overdueRentals") {
    return rentalsTable("overdue-rentals", getOverdueRentals());
  }

  if (request.type === "returnedRentals") {
    return rentalsTable(
      "returned-rentals",
      getReturnedRentals({
        dateFrom: request.startDate,
        dateTo: request.endDate,
        pageSize: 100,
      }).rows,
    );
  }

  if (request.type === "dailyPayments") {
    const date = request.date ?? toDateInputValue(new Date());
    const payments = getDailyPayments({ date, pageSize: 100 }).rows;

    return {
      name: "daily-payments",
      headers: ["Date", "Contract", "Customer", "Type", "Method", "Amount", "Notes"],
      rows: payments.map((payment) => [
        payment.paymentDate,
        payment.contractNo,
        payment.customerName,
        payment.type,
        payment.method,
        payment.type === "refund" ? -payment.amount : payment.amount,
        payment.notes,
      ]),
    };
  }

  if (request.type === "vehicleIncome") {
    const rows = getVehicleIncome(requiredStart(request), requiredEnd(request));
    return {
      name: "vehicle-income",
      headers: ["Plate", "Brand", "Model", "Rentals", "Income"],
      rows: rows.map((row) => [
        row.plateNumber,
        row.brand,
        row.model,
        row.rentalCount,
        row.totalIncome,
      ]),
    };
  }

  if (request.type === "vehicleSales") {
    const rows = getVehicleSales({
      dateFrom: request.startDate,
      dateTo: request.endDate,
      search: request.search,
      pageSize: 100,
    }).rows;
    return {
      name: "vehicle-sales",
      headers: ["Sale No", "Date", "Plate", "Vehicle", "Buyer", "Phone", "Method", "Price", "Status", "Notes"],
      rows: rows.map((row) => [
        row.saleNo,
        row.saleDate,
        row.vehiclePlateNumber,
        `${row.vehicleBrand} ${row.vehicleModel}`,
        row.buyerName,
        row.buyerPhone,
        row.paymentMethod,
        row.salePrice,
        row.status,
        row.notes,
      ]),
    };
  }

  if (request.type === "outstandingBalances") {
    const rows = getOutstandingBalances();
    return {
      name: "outstanding-balances",
      headers: ["Contract", "Customer", "Phone", "Plate", "Status", "Total", "Paid", "Remaining"],
      rows: rows.map((row) => [
        row.contractNo,
        row.customerName,
        row.customerPhone,
        row.vehiclePlateNumber,
        row.status,
        row.totalAmount,
        row.paidAmount,
        row.remainingAmount,
      ]),
    };
  }

  if (request.type === "dailyClosing") {
    const row = getDailyClosing(request.date ?? toDateInputValue(new Date()));
    return {
      name: "daily-closing",
      headers: [
        "Date",
        "Cash",
        "Card",
        "Bank",
        "Other",
        "Vehicle Sales",
        "Refunds",
        "Expenses",
        "Owner Withdrawals",
        "Total Collected",
        "Expected Cash",
        "Counted Cash",
        "Difference",
        "Unpaid Returns",
      ],
      rows: [[
        row.date,
        row.cashPayments,
        row.cardPayments,
        row.bankTransfers,
        row.otherPayments,
        row.vehicleSales,
        row.refunds,
        row.expenses,
        row.ownerWithdrawals,
        row.totalCollected,
        row.expectedCash,
        row.countedCash,
        row.difference,
        row.returnedRentalsUnpaidToday,
      ]],
    };
  }

  if (request.type === "accountingTransactions") {
    const rows = listAccountingTransactions({
      dateFrom: request.startDate,
      dateTo: request.endDate,
      pageSize: 100,
    }).rows;

    return {
      name: "accounting-transactions",
      headers: ["Date", "Kind", "Title", "Detail", "Amount", "Status", "From", "To", "Notes"],
      rows: rows.map((row) => [
        row.occurredAt,
        row.kind,
        row.title,
        row.detail,
        row.kind === "money_out" || (row.kind === "adjustment" && row.fromLocation)
          ? -row.amount
          : row.amount,
        row.status,
        row.fromLocation,
        row.toLocation,
        row.notes,
      ]),
    };
  }

  if (request.type === "expenses") {
    const rows = listExpenses({
      dateFrom: request.startDate,
      dateTo: request.endDate,
      pageSize: 100,
    }).rows;

    return {
      name: "expenses",
      headers: ["Date", "Category", "Location", "Method", "Amount", "Vendor", "Vehicle", "Status", "Notes"],
      rows: rows.map((row) => [
        row.expenseDate,
        row.category,
        row.location,
        row.method,
        row.amount,
        row.vendorName,
        row.vehiclePlateNumber,
        row.status,
        row.notes,
      ]),
    };
  }

  if (request.type === "deposits") {
    const rows = getDeposits();
    return {
      name: "deposits",
      headers: ["Contract", "Customer", "Plate", "Status", "Required", "Paid", "Refunded", "Held"],
      rows: rows.map((row) => [
        row.contractNo,
        row.customerName,
        row.vehiclePlateNumber,
        row.status,
        row.depositRequired,
        row.depositPaid,
        row.depositRefunded,
        row.depositHeld,
      ]),
    };
  }

  if (request.type === "vehicleUtilization") {
    const rows = getVehicleUtilization(requiredStart(request), requiredEnd(request));
    return {
      name: "vehicle-utilization",
      headers: ["Plate", "Brand", "Model", "Rentals", "Rented Days", "Period Days", "Utilization %"],
      rows: rows.map((row) => [
        row.plateNumber,
        row.brand,
        row.model,
        row.rentalCount,
        row.rentedDays,
        row.periodDays,
        row.utilizationPercent,
      ]),
    };
  }

  if (request.type === "vehicleNetSummary") {
    const rows = getVehicleNetSummary(requiredStart(request), requiredEnd(request));
    return {
      name: "vehicle-net-summary",
      headers: ["Plate", "Brand", "Model", "Rental Income", "Maintenance Cost", "Simple Net"],
      rows: rows.map((row) => [
        row.plateNumber,
        row.brand,
        row.model,
        row.rentalIncome,
        row.maintenanceCost,
        row.simpleNet,
      ]),
    };
  }

  if (request.type === "expiringDocuments") {
    const rows = getExpiringDocuments();
    const language = getShopSettings().language;
    return {
      name: "expiring-documents",
      headers: ["Type", "Name", "Document", "Expiry Date", "Days Remaining"],
      rows: rows.map((row) => [
        row.entityType,
        row.name,
        formatExpiringDocumentType(row.documentType, language),
        row.expiryDate,
        row.daysRemaining,
      ]),
    };
  }

  if (request.type === "cancelledRentals") {
    const rows = getCancelledRentals();
    return {
      name: "cancelled-rentals",
      headers: ["Contract", "Customer", "Plate", "Cancelled At", "Reason", "Total"],
      rows: rows.map((row) => [
        row.contractNo,
        row.customerName,
        row.vehiclePlateNumber,
        row.cancelledAt,
        row.cancelReason,
        row.totalAmount,
      ]),
    };
  }

  const rows = getPaymentVoids();
  return {
    name: "payment-voids",
    headers: ["Receipt", "Contract", "Customer", "Type", "Method", "Amount", "Voided At", "Reason"],
    rows: rows.map((row) => [
      row.receiptNo,
      row.contractNo,
      row.customerName,
      row.type,
      row.method,
      row.amount,
      row.voidedAt,
      row.voidReason,
    ]),
  };
}

function rentalsTable(name: string, rows: ReturnType<typeof getActiveRentals>): ExportTable {
  return {
    name,
    headers: ["Contract", "Customer", "Phone", "Plate", "Status", "Start", "Expected", "Returned", "Total", "Paid", "Remaining"],
    rows: rows.map((row) => [
      row.contractNo,
      row.customerName,
      row.customerPhone,
      row.vehiclePlateNumber,
      row.status,
      row.startDatetime,
      row.expectedReturnDatetime,
      row.actualReturnDatetime,
      row.totalAmount,
      row.paidAmount,
      row.remainingAmount,
    ]),
  };
}

function writeCsv(filePath: string, table: ExportTable): void {
  const rows = [table.headers, ...table.rows].map((row) =>
    row.map(csvEscape).join(","),
  );

  fs.writeFileSync(filePath, `\uFEFF${rows.join("\r\n")}`, "utf8");
}

async function writeXlsx(filePath: string, table: ExportTable): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");
  worksheet.addRow(table.headers);
  for (const row of table.rows) {
    worksheet.addRow(row);
  }
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D97D7" },
  };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: table.headers.length },
  };
  worksheet.columns.forEach((column) => {
    const values = column.values ?? [];
    column.width = Math.min(
      36,
      Math.max(
        12,
        ...values
          .slice(1)
          .map((value) => String(value ?? "").length + 2),
      ),
    );
  });

  await workbook.xlsx.writeFile(filePath);
}

function csvEscape(value: ExportCell): string {
  const text = value === null ? "" : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function requiredStart(request: ReportExportRequest): string {
  return request.startDate ?? toDateInputValue(new Date());
}

function requiredEnd(request: ReportExportRequest): string {
  return request.endDate ?? toDateInputValue(new Date());
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
