import {
  CheckCircle2,
  CreditCard,
  FileDown,
  Info,
  Plus,
  Printer,
  Search,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { MetricStrip } from "@/components/ui/metric-strip";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SidePanel } from "@/components/ui/side-panel";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import type { PaymentInput, PaymentRecord } from "@/shared/payments";
import type {
  RentalActivationInput,
  RentalFormOptions,
  RentalListRecord,
  RentalListSummary,
  RentalQueue,
  RentalReturnInput,
} from "@/shared/rentals";
import { RentalForm } from "./RentalForm";
import { RentalPaymentPanel } from "./RentalPaymentPanel";
import { RentalReturnForm } from "./RentalReturnForm";
import { RentalStatusBadge } from "./RentalStatusBadge";

type RentalPanelState =
  | { mode: "create" }
  | { mode: "detail"; rental: RentalListRecord }
  | { mode: "return"; rental: RentalListRecord }
  | { mode: "payment"; rental: RentalListRecord }
  | null;

const emptySummary: RentalListSummary = {
  total: 0,
  active: 0,
  overdue: 0,
  returned: 0,
  amount: 0,
};

const emptyRentalPage: PageResult<RentalListRecord, RentalListSummary> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  summary: emptySummary,
};

const queueTabs: { value: RentalQueue; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due Today" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export function RentalsPage() {
  const { formatCurrency, formatDateTime, locale, settings, t } = useI18n();
  const [rentalPage, setRentalPage] = useState(emptyRentalPage);
  const [options, setOptions] = useState<RentalFormOptions>({
    customers: [],
    vehicles: [],
  });
  const [queue, setQueue] = useState<RentalQueue>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [panelState, setPanelState] = useState<RentalPanelState>(null);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pendingReturn, setPendingReturn] = useState<RentalReturnInput | null>(null);
  const [rentalToCancel, setRentalToCancel] = useState<RentalListRecord | null>(null);

  const loadRentals = useCallback(async (nextPage = page) => {
    setIsLoading(true);
    setListError(null);

    try {
      const result = await window.rentalApp.rentals.list({
        page: nextPage,
        queue,
        search,
      });
      setRentalPage(result);
      return result.rows;
    } catch (error) {
      setListError(getErrorMessage(error, t("Rentals could not be loaded.")));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [page, queue, search, t]);

  const loadOptions = useCallback(async () => {
    const formOptions = await window.rentalApp.rentals.getFormOptions();
    setOptions(formOptions);
  }, []);

  const loadPayments = useCallback(async (rentalId: number) => {
    setPaymentError(null);

    try {
      const records = await window.rentalApp.payments.listForRental(rentalId);
      setPaymentRecords(records);
      return records;
    } catch (error) {
      setPaymentError(getErrorMessage(error, t("Payments could not be loaded.")));
      return [];
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadOptions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadOptions]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRentals(page);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadRentals, page]);

  const summary = rentalPage.summary ?? emptySummary;

  async function handleActivateRental(input: RentalActivationInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.rentals.activate(input);
      setPanelState(null);
      setPage(1);
      await Promise.all([loadOptions(), loadRentals(1)]);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Rental could not be activated.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReturnRental(input: RentalReturnInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.rentals.return(input);
      setPanelState(null);
      await Promise.all([loadOptions(), loadRentals(page)]);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Rental could not be returned.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelRental(rental: RentalListRecord) {
    setIsSaving(true);
    setListError(null);

    try {
      await window.rentalApp.rentals.cancel(rental.id);
      setPanelState(null);
      await Promise.all([loadOptions(), loadRentals(page)]);
    } catch (error) {
      setListError(getErrorMessage(error, t("Rental could not be cancelled.")));
    } finally {
      setIsSaving(false);
      setRentalToCancel(null);
    }
  }

  async function handleCreatePayment(input: PaymentInput) {
    setIsSaving(true);
    setPaymentError(null);

    try {
      await window.rentalApp.payments.create(input);
      const [updatedRentals] = await Promise.all([
        loadRentals(page),
        loadPayments(input.rentalId),
      ]);
      const updatedRental = updatedRentals.find(
        (rental) => rental.id === input.rentalId,
      );

      if (updatedRental) {
        setPanelState({ mode: "payment", rental: updatedRental });
      }
    } catch (error) {
      setPaymentError(getErrorMessage(error, t("Payment could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function openCreateForm() {
    setFormError(null);
    await loadOptions();
    setPanelState({ mode: "create" });
  }

  async function openDetailPanel(rental: RentalListRecord) {
    setPaymentRecords([]);
    await loadPayments(rental.id);
    setPanelState({ mode: "detail", rental });
  }

  function openReturnForm(rental: RentalListRecord) {
    setFormError(null);
    setPanelState({ mode: "return", rental });
  }

  async function openPaymentPanel(rental: RentalListRecord) {
    setPaymentError(null);
    setPaymentRecords([]);
    await loadPayments(rental.id);
    setPanelState({ mode: "payment", rental });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleQueueChange(nextQueue: RentalQueue) {
    setQueue(nextQueue);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-10"
            placeholder={t("Search contract, customer, or plate")}
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
        </div>

        <Button onClick={() => void openCreateForm()}>
          <Plus data-icon="inline-start" />
          {t("New Rental")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {queueTabs.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            size="sm"
            variant={queue === tab.value ? "default" : "outline"}
            onClick={() => handleQueueChange(tab.value)}
          >
            {t(tab.label)}
          </Button>
        ))}
      </div>

      <SidePanel
        open={Boolean(panelState)}
        title={getPanelTitle(panelState, t)}
        description={getPanelDescription(panelState, t)}
        width={panelState?.mode === "create" ? "lg" : "md"}
        onClose={() => setPanelState(null)}
      >
        {panelState?.mode === "create" ? (
          <RentalForm
            error={formError}
            isSaving={isSaving}
            options={options}
            onCancel={() => setPanelState(null)}
            onSave={handleActivateRental}
          />
        ) : null}

        {panelState?.mode === "detail" ? (
          <RentalDetailPanel
            currency={settings.defaultCurrency}
            formatCurrency={formatCurrency}
            formatDateTime={formatDateTime}
            isSaving={isSaving}
            paymentError={paymentError}
            payments={paymentRecords}
            rental={panelState.rental}
            t={t}
            onCancelRental={() => setRentalToCancel(panelState.rental)}
            onPrintContract={(printToPDF) =>
              void window.rentalApp.rentals.printContract(panelState.rental.id, printToPDF)
            }
            onRecordPayment={() => void openPaymentPanel(panelState.rental)}
            onReturnVehicle={() => openReturnForm(panelState.rental)}
          />
        ) : null}

        {panelState?.mode === "return" ? (
          <RentalReturnForm
            error={formError}
            currency={settings.defaultCurrency}
            defaultLateFee={settings.defaultLateFee}
            isSaving={isSaving}
            rental={panelState.rental}
            onCancel={() => setPanelState({ mode: "detail", rental: panelState.rental })}
            onSave={(input) => {
              setPendingReturn(input);
              return Promise.resolve();
            }}
          />
        ) : null}

        {panelState?.mode === "payment" ? (
          <RentalPaymentPanel
            error={paymentError}
            currency={settings.defaultCurrency}
            isSaving={isSaving}
            payments={paymentRecords}
            rental={panelState.rental}
            onCancel={() => setPanelState({ mode: "detail", rental: panelState.rental })}
            onSave={handleCreatePayment}
          />
        ) : null}
      </SidePanel>

      <MetricStrip
        columns={5}
        items={[
          { label: t("Total Rentals"), value: <BidiValue value={new Intl.NumberFormat(locale).format(summary.total)} /> },
          { label: t("Active"), value: <BidiValue value={new Intl.NumberFormat(locale).format(summary.active)} /> },
          { label: t("Overdue"), tone: "danger", value: <BidiValue value={new Intl.NumberFormat(locale).format(summary.overdue)} /> },
          { label: t("Returned"), value: <BidiValue value={new Intl.NumberFormat(locale).format(summary.returned)} /> },
          { label: t("Rent Total"), value: <BidiValue value={formatCurrency(summary.amount)} /> },
        ]}
      />

      <section className="rounded-md border bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{t("Rental List")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Search by contract number, customer name, or plate number.")}
            </p>
          </div>
          <Badge variant="secondary">
            {t("{{count}} shown", { count: rentalPage.total })}
          </Badge>
        </div>
        {listError ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {listError}
          </div>
        ) : null}

        <DataTable className="min-w-[900px]">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <Th>{t("Contract")}</Th>
              <Th>{t("Customer")}</Th>
              <Th>{t("Vehicle")}</Th>
              <Th>{t("Due / Returned")}</Th>
              <Th className="text-end">{t("Remaining")}</Th>
              <Th>{t("Status")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={7} message={t("Loading rentals...")} />
            ) : rentalPage.rows.length === 0 ? (
              <EmptyTableRow
                colSpan={7}
                message={
                  search.trim()
                    ? t("No rentals match this search.")
                    : t("No rentals yet. Use New Rental to activate the first one.")
                }
              />
            ) : (
              rentalPage.rows.map((rental) => (
                <tr key={rental.id} className="border-t hover:bg-muted/25">
                  <Td>
                    <BidiValue className="font-semibold" value={rental.contractNo} />
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{rental.customerName}</span>
                      <BidiValue className="text-xs text-muted-foreground" value={rental.customerPhone} />
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <BidiValue className="font-medium" value={rental.vehiclePlateNumber} />
                      <span className="text-xs text-muted-foreground">
                        {rental.vehicleBrand} {rental.vehicleModel}
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    <BidiValue
                      value={formatDateTime(
                        rental.actualReturnDatetime ?? rental.expectedReturnDatetime,
                      )}
                    />
                  </Td>
                  <Td className="text-end font-semibold">
                    <BidiValue value={formatCurrency(rental.remainingAmount)} />
                  </Td>
                  <Td>
                    <RentalStatusBadge status={rental.status} />
                  </Td>
                  <Td className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      {canOperateRental(rental) ? (
                        <>
                          <Button size="sm" onClick={() => openReturnForm(rental)}>
                            <CheckCircle2 data-icon="inline-start" />
                            {t("Return Vehicle")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openPaymentPanel(rental)}
                          >
                            <CreditCard data-icon="inline-start" />
                            {t("Record Payment")}
                          </Button>
                        </>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void openDetailPanel(rental)}
                      >
                        <Info data-icon="inline-start" />
                        {t("Details")}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <PaginationControls page={rentalPage} t={t} onPageChange={setPage} />
      </section>

      <ConfirmDialog
        open={Boolean(rentalToCancel)}
        title={t("Cancel rental?")}
        description={t("Cancel rental confirmation")}
        cancelLabel={t("Keep Rental")}
        confirmLabel={t("Cancel Rental")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setRentalToCancel(null)}
        onConfirm={() => {
          if (rentalToCancel) {
            void handleCancelRental(rentalToCancel);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingReturn)}
        title={t("Return vehicle?")}
        description={t("Return vehicle confirmation")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Mark Returned")}
        isBusy={isSaving}
        onCancel={() => setPendingReturn(null)}
        onConfirm={() => {
          if (pendingReturn) {
            void handleReturnRental(pendingReturn).then(() => setPendingReturn(null));
          }
        }}
      />
    </div>
  );
}

function RentalDetailPanel({
  currency,
  formatCurrency,
  formatDateTime,
  isSaving,
  onCancelRental,
  onPrintContract,
  onRecordPayment,
  onReturnVehicle,
  paymentError,
  payments,
  rental,
  t,
}: {
  currency: string;
  formatCurrency: (amount: number) => string;
  formatDateTime: (value: string | Date) => string;
  isSaving: boolean;
  onCancelRental: () => void;
  onPrintContract: (printToPDF: boolean) => void;
  onRecordPayment: () => void;
  onReturnVehicle: () => void;
  paymentError: string | null;
  payments: PaymentRecord[];
  rental: RentalListRecord;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const canOperate = canOperateRental(rental);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label={t("Contract")} value={<BidiValue value={rental.contractNo} />} />
        <DetailItem label={t("Status")} value={<RentalStatusBadge status={rental.status} />} />
        <DetailItem label={t("Customer")} value={rental.customerName} />
        <DetailItem label={t("Phone")} value={<BidiValue value={rental.customerPhone} />} />
        <DetailItem
          label={t("Vehicle")}
          value={`${rental.vehicleBrand} ${rental.vehicleModel}`}
        />
        <DetailItem label={t("Plate")} value={<BidiValue value={rental.vehiclePlateNumber} />} />
      </div>

      <div className="rounded-md border">
        <div className="border-b px-4 py-3 font-medium">{t("Amounts")}</div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <DetailItem label={t("Total Amount")} value={<BidiValue value={formatCurrency(rental.totalAmount)} />} alignEnd />
          <DetailItem label={t("Paid Amount")} value={<BidiValue value={formatCurrency(rental.paidAmount)} />} alignEnd />
          <DetailItem label={t("Remaining")} value={<BidiValue value={formatCurrency(rental.remainingAmount)} />} alignEnd />
        </div>
      </div>

      <div className="rounded-md border">
        <div className="border-b px-4 py-3 font-medium">{t("Rental Period")}</div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <DetailItem label={t("Start")} value={<BidiValue value={formatDateTime(rental.startDatetime)} />} />
          <DetailItem label={t("Expected Return")} value={<BidiValue value={formatDateTime(rental.expectedReturnDatetime)} />} />
          <DetailItem
            label={t("Actual Return")}
            value={
              rental.actualReturnDatetime
                ? <BidiValue value={formatDateTime(rental.actualReturnDatetime)} />
                : t("No date")
            }
          />
          <DetailItem label={t("Currency")} value={<BidiValue value={currency} />} />
        </div>
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-medium">{t("Payments")}</h3>
          <Button size="sm" variant="outline" onClick={onRecordPayment}>
            <CreditCard data-icon="inline-start" />
            {t("Record Payment")}
          </Button>
        </div>
        {paymentError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {paymentError}
          </div>
        ) : null}
        <div className="flex flex-col">
          {payments.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("No payments recorded for this rental yet.")}
            </div>
          ) : (
            payments.map((payment) => (
              <div key={payment.id} className="grid gap-2 border-t px-4 py-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="font-medium">{t(payment.type === "refund" ? "Refund" : "Payment")}</div>
                  <BidiValue className="text-xs text-muted-foreground" value={formatDateTime(payment.paymentDate)} />
                </div>
                <BidiValue
                  className="text-end font-semibold"
                  value={`${payment.type === "refund" ? "-" : ""}${formatCurrency(payment.amount)}`}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {canOperate ? (
          <Button onClick={onReturnVehicle}>
            <CheckCircle2 data-icon="inline-start" />
            {t("Return Vehicle")}
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => onPrintContract(false)}>
          <Printer data-icon="inline-start" />
          {t("Print Contract")}
        </Button>
        <Button variant="outline" onClick={() => onPrintContract(true)}>
          <FileDown data-icon="inline-start" />
          {t("PDF")}
        </Button>
        {canOperate ? (
          <Button variant="destructive" disabled={isSaving} onClick={onCancelRental}>
            <XCircle data-icon="inline-start" />
            {t("Cancel Rental")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DetailItem({
  alignEnd = false,
  label,
  value,
}: {
  alignEnd?: boolean;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={alignEnd ? "text-end" : undefined}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 text-sm font-medium">{value}</div>
    </div>
  );
}

function getPanelTitle(
  panelState: RentalPanelState,
  t: (key: string) => string,
): string {
  if (panelState?.mode === "detail") {
    return t("Rental Details");
  }

  if (panelState?.mode === "return") {
    return t("Return Vehicle");
  }

  if (panelState?.mode === "payment") {
    return t("Record Payment");
  }

  return t("New Rental");
}

function getPanelDescription(
  panelState: RentalPanelState,
  t: (key: string) => string,
): string {
  if (panelState?.mode === "detail") {
    return `${panelState.rental.contractNo} · ${panelState.rental.customerName} · ${panelState.rental.vehiclePlateNumber}`;
  }

  if (panelState?.mode === "return") {
    return `${panelState.rental.contractNo} · ${panelState.rental.vehiclePlateNumber} · ${panelState.rental.customerName}`;
  }

  if (panelState?.mode === "payment") {
    return `${panelState.rental.contractNo} · ${panelState.rental.customerName} · ${panelState.rental.vehiclePlateNumber}`;
  }

  return t("Choose customer and vehicle, then activate the contract.");
}

function canOperateRental(rental: RentalListRecord): boolean {
  return rental.status === "active" || rental.status === "overdue";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
