import type { ReportExportType } from "@/shared/reports";

/**
 * Which controls each report shows, which columns it has, and what it says when
 * it has nothing.
 *
 * All of it is a pure function of the report type, so it lives apart from the
 * component that fetches and renders. Every `ReportExportType` branch that
 * existed before is preserved here unchanged — the filters a report offers and
 * the page it pages are decided by exactly the same predicates.
 */
export function usesSingleDate(type: ReportExportType): boolean {
  return type === "dailyClosing";
}

export function usesRange(type: ReportExportType): boolean {
  return type === "vehicleUtilization" || type === "vehicleNetSummary" || type === "vehicleSales";
}

export function isPagedOperationalReport(type: ReportExportType): boolean {
  return type === "deposits" || type === "outstandingBalances" || type === "vehicleSales";
}

export function usesSearch(type: ReportExportType): boolean {
  return type === "vehicleSales";
}

export function formatHeader(value: string): string {
  const labels: Record<string, string> = {
    bankTransfers: "Bank Transfers",
    buyerIdNumber: "Buyer ID Number",
    buyerName: "Buyer Name",
    buyerPhone: "Buyer Phone",
    cancelledAt: "Cancelled At",
    cancelReason: "Cancel Reason",
    cardPayments: "Card Payments",
    cashPayments: "Cash Payments",
    contractNo: "Contract No",
    customerName: "Customer",
    customerPhone: "Phone",
    daysRemaining: "Days Remaining",
    depositHeld: "Deposit Held",
    depositPaid: "Deposit Paid",
    depositRefunded: "Deposit Refunded",
    depositRequired: "Deposit Required",
    documentType: "Document Type",
    entityType: "Entity",
    expectedReturnDatetime: "Expected Return",
    expiryDate: "Expiry",
    maintenanceCost: "Maintenance Cost",
    method: "Method",
    openBalancesCreatedToday: "Open Balances Created Today",
    otherPayments: "Other Payments",
    ownerWithdrawals: "Owner Withdrawals",
    paidAmount: "Paid",
    paymentId: "Payment Id",
    periodDays: "Period Days",
    plateNumber: "Plate",
    receiptNo: "Receipt No.",
    refund: "Refund",
    refunds: "Refunds",
    expenses: "Expenses",
    expectedCash: "Expected Cash",
    countedCash: "Counted Cash",
    difference: "Difference",
    remainingAmount: "Balance due",
    rentalCount: "Rentals",
    rentalId: "Rental Id",
    rentalIncome: "Rental Income",
    returnedRentalsUnpaidToday: "Returned Rentals Unpaid Today",
    saleDate: "Sale Date",
    saleNo: "Sale No.",
    salePrice: "Sale Price",
    simpleNet: "Simple Net",
    status: "Status",
    totalAmount: "Total Amount",
    totalCollected: "Total Collected",
    type: "Type",
    utilizationPercent: "Utilization Percent",
    vehicleId: "Vehicle Id",
    vehicleBrand: "Brand",
    vehicleModel: "Model",
    vehiclePlateNumber: "Plate",
    vehicleSales: "Vehicle Sales",
    vehicleType: "Vehicle Type",
    voidedAt: "Voided At",
    voidReason: "Void Reason",
  };

  return labels[value] ?? value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export function getEmptyMessage(type: ReportExportType): string {
  if (type === "cancelledRentals") {
    return "No cancelled rentals found. Cancelled contracts will appear here after a manager cancels a rental.";
  }

  if (type === "paymentVoids") {
    return "No payment voids found. Voided payments will appear here for review.";
  }

  if (type === "expiringDocuments") {
    return "No expiring documents found.";
  }

  return "No records found.";
}

export function getHeaders(type: ReportExportType): string[] {
  if (type === "dailyClosing") {
    return [
      "cashPayments",
      "cardPayments",
      "bankTransfers",
      "otherPayments",
      "vehicleSales",
      "refunds",
      "expenses",
      "ownerWithdrawals",
      "totalCollected",
      "expectedCash",
      "countedCash",
      "difference",
      "openBalancesCreatedToday",
      "returnedRentalsUnpaidToday",
    ];
  }

  // Return predefined headers to avoid displaying internal database keys
  return getFallbackHeaders(type);
}

function getFallbackHeaders(type: ReportExportType): string[] {
  const headers: Partial<Record<ReportExportType, string[]>> = {
    outstandingBalances: [
      "contractNo",
      "customerName",
      "vehiclePlateNumber",
      "status",
      "remainingAmount",
    ],
    dailyClosing: [
      "date",
      "cashPayments",
      "cardPayments",
      "bankTransfers",
      "vehicleSales",
      "refunds",
      "expenses",
      "totalCollected",
    ],
    deposits: [
      "contractNo",
      "customerName",
      "vehiclePlateNumber",
      "depositPaid",
      "depositHeld",
    ],
    vehicleUtilization: [
      "plateNumber",
      "rentalCount",
      "rentedDays",
      "periodDays",
      "utilizationPercent",
    ],
    vehicleNetSummary: [
      "plateNumber",
      "rentalIncome",
      "maintenanceCost",
      "simpleNet",
    ],
    expiringDocuments: [
      "entityType",
      "name",
      "documentType",
      "expiryDate",
      "daysRemaining",
    ],
    cancelledRentals: [
      "contractNo",
      "customerName",
      "vehiclePlateNumber",
      "cancelledAt",
      "cancelReason",
    ],
    paymentVoids: [
      "receiptNo",
      "contractNo",
      "customerName",
      "type",
      "voidedAt",
      "voidReason",
    ],
    vehicleSales: [
      "saleNo",
      "saleDate",
      "vehiclePlateNumber",
      "vehicleBrand",
      "vehicleModel",
      "buyerName",
      "buyerPhone",
      "paymentMethod",
      "salePrice",
      "status",
    ],
  };

  return headers[type] ?? [];
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
