import { BidiValue } from "@/components/ui/bidi-value";
import type { DailyClosingRecord } from "@/shared/reports";

/**
 * The daily closing shown as cards rather than a table: one row of totals that
 * a shop reads at a glance, with the three figures that matter — expected,
 * counted and the difference — separated from the breakdown below.
 *
 * Presentation only. It receives the row and the formatters; it fetches
 * nothing and decides nothing about loading beyond what it is told.
 */
export function DailyClosingSummary({
  formatCurrency,
  loading,
  numberFormatter,
  row,
  t,
}: {
  formatCurrency: (value: number) => string;
  loading: boolean;
  numberFormatter: Intl.NumberFormat;
  row: DailyClosingRecord | undefined;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-muted/35 px-4 py-10 text-center text-sm text-muted-foreground">
        {t("Loading...")}
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-2xl border border-border/80 bg-muted/35 px-4 py-10 text-center text-sm text-muted-foreground">
        {t("No records found.")}
      </div>
    );
  }

  const secondaryItems = [
    { label: "Cash payments", value: formatCurrency(row.cashPayments) },
    { label: "Card payments", value: formatCurrency(row.cardPayments) },
    { label: "Bank transfers", value: formatCurrency(row.bankTransfers) },
    { label: "Vehicle Sales", value: formatCurrency(row.vehicleSales) },
    { label: "Refunds", tone: "warning" as const, value: formatCurrency(row.refunds) },
    { label: "Expenses", tone: "warning" as const, value: formatCurrency(row.expenses) },
    { label: "Total collected", tone: "primary" as const, value: formatCurrency(row.totalCollected) },
    { label: "Other Payments", value: formatCurrency(row.otherPayments) },
    { label: "Owner Withdrawals", value: formatCurrency(row.ownerWithdrawals) },
    {
      label: "Open balances created today",
      value: numberFormatter.format(row.openBalancesCreatedToday),
    },
    {
      label: "Returned rentals unpaid today",
      value: numberFormatter.format(row.returnedRentalsUnpaidToday),
    },
  ];

  const primaryItems = [
    { label: "Expected Cash", value: formatCurrency(row.expectedCash) },
    {
      label: "Counted Cash",
      value: row.countedCash === null ? t("Not available") : formatCurrency(row.countedCash),
    },
    {
      label: "Difference",
      tone: row.difference === null || row.difference === 0 ? undefined : "warning" as const,
      value: row.difference === null ? t("Not available") : formatCurrency(row.difference),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {primaryItems.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs"
          >
            <div className="text-xs font-semibold text-muted-foreground">
              {t(item.label)}
            </div>
            <BidiValue
              className={`mt-2 text-2xl font-bold ${
                item.tone === "warning"
                  ? "text-warning"
                  : item.tone === "primary"
                    ? "text-primary"
                    : "text-foreground"
              }`}
              value={item.value}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/80 bg-muted/25 p-3 md:grid-cols-3">
        {secondaryItems.map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl bg-card px-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {t(item.label)}
            </div>
            <BidiValue className="mt-1 font-semibold" value={item.value} />
          </div>
        ))}
      </div>
    </div>
  );
}
