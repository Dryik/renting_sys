import { Printer, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { MoneyText } from "@/components/ui/money-text";
import { SearchInput } from "@/components/ui/search-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBusinessQuery, useCommandMutation } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useDebouncedValue } from "@/data/useDebouncedValue";
import { useI18n } from "@/hooks/useI18n";
import { formatPaymentMethod, formatPaymentType, type PaymentListRecord } from "@/shared/payments";

export function PaymentReceiptsReport() {
  const { formatCurrency, formatDate, language, t } = useI18n();
  const [search, setSearch] = useState("");
  const [printingId, setPrintingId] = useState<number | null>(null);
  // Notices raised by printing. A failed load is derived below.
  const [printNotice, setPrintNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const debouncedSearch = useDebouncedValue(search, 200);
  const request = { page: 1, pageSize: 50, search: debouncedSearch };
  const paymentsQuery = useBusinessQuery(
    "payments",
    "list",
    request,
    () => rentalAppApi.payments.list(request),
  );
  const payments: PaymentListRecord[] = paymentsQuery.data?.rows ?? [];
  const isLoading = paymentsQuery.isPending;
  // Printing produces a document; it changes nothing, so it invalidates
  // nothing.
  const printReceipt = useCommandMutation(
    ({ paymentId, printToPDF }: { paymentId: number; printToPDF: boolean }) =>
      rentalAppApi.payments.printReceipt(paymentId, printToPDF),
  );

  const notice = printNotice ??
    (paymentsQuery.isError
      ? { type: "error" as const, text: t("Payment receipts could not be loaded.") }
      : null);

  async function handlePrint(paymentId: number, printToPDF: boolean) {
    setPrintingId(paymentId);
    setPrintNotice(null);
    try {
      await printReceipt.mutateAsync({ paymentId, printToPDF });
      setPrintNotice({
        type: "success",
        text: printToPDF ? t("Receipt PDF saved successfully.") : t("Receipt sent to printer."),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setPrintNotice({ type: "error", text: msg || t("Failed to print receipt.") });
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <SearchInput
            placeholder={t("Search by receipt number, customer, contract, or plate...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {t("{{count}} receipts found", { count: payments.length })}
        </div>
      </div>

      {notice ? (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium ${
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <DataTable className="min-w-[760px]">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <Th>{t("Receipt No.")}</Th>
            <Th>{t("Contract Number")}</Th>
            <Th>{t("Customer Name")}</Th>
            <Th>{t("Vehicle Plate Number")}</Th>
            <Th>{t("Payment Date")}</Th>
            <Th>{t("Type")}</Th>
            <Th>{t("Method")}</Th>
            <Th className="text-end">{t("Amount")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-end">{t("Actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyTableRow colSpan={10} message={t("Loading payment receipts...")} state="loading" />
          ) : payments.length === 0 ? (
            <EmptyTableRow
              colSpan={10}
              message={search.trim() ? t("No payment receipts match this search.") : t("No payment receipts found.")}
            />
          ) : (
            payments.map((payment) => (
              <tr key={payment.id} className="group hover:bg-muted/35">
                <Td className="font-bold text-foreground">
                  {payment.receiptNo ?? `REC-${String(payment.id).padStart(6, "0")}`}
                </Td>
                <Td className="font-mono text-xs">{payment.contractNo}</Td>
                <Td>{payment.customerName}</Td>
                <Td className="font-mono text-xs">{payment.vehiclePlateNumber}</Td>
                <Td>{formatDate(payment.paymentDate)}</Td>
                <Td>{formatPaymentType(payment.type, language)}</Td>
                <Td>{formatPaymentMethod(payment.method, language)}</Td>
                <Td className="text-end font-bold">
                  <MoneyText amount={payment.amount} formatCurrency={formatCurrency} />
                </Td>
                <Td>
                  <StatusBadge tone={payment.status === "voided" ? "danger" : "success"}>
                    {payment.status === "voided" ? t("Voided") : t("Completed")}
                  </StatusBadge>
                </Td>
                <Td className="text-end">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      disabled={printingId === payment.id}
                      size="sm"
                      variant="outline"
                      onClick={() => void handlePrint(payment.id, false)}
                    >
                      <Printer className="size-3.5" data-icon="inline-start" />
                      {t("Print Receipt")}
                    </Button>
                    <Button
                      disabled={printingId === payment.id}
                      size="sm"
                      variant="ghost"
                      onClick={() => void handlePrint(payment.id, true)}
                    >
                      <Download className="size-3.5" data-icon="inline-start" />
                      {t("Export PDF")}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
