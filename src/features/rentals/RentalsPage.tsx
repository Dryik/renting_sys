import {
  CheckCircle2,
  CreditCard,
  FileDown,
  Info,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { MoneyText } from "@/components/ui/money-text";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedFilter } from "@/components/ui/segmented-filter";
import { SidePanel } from "@/components/ui/side-panel";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBusinessMutation,
  useBusinessQuery,
  useBusinessQueryKey,
  useCommandMutation,
} from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useDebouncedValue } from "@/data/useDebouncedValue";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { cn } from "@/lib/utils";
import { normalizeDigits } from "@/shared/numerals";
import type { PageResult } from "@/shared/pagination";
import type { PaymentInput, PaymentRecord } from "@/shared/payments";
import { formatCollateralType } from "@/shared/rentals";
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

export type RentalWorkflowRequest = "create" | "return";

type RentalsPageProps = {
  workflowRequest?: RentalWorkflowRequest | null;
  workflowRequestKey?: string | number;
};

type PrintAction = "print" | "pdf";
type PendingReturn = RentalReturnInput;
type PendingVoidPayment = PaymentRecord | null;

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

const emptyFormOptions: RentalFormOptions = {
  accessories: [],
  customers: [],
  vehicles: [],
  salesUsers: [],
};

const queueTabs: { value: RentalQueue; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due Today" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export function RentalsPage({
  workflowRequest = null,
  workflowRequestKey,
}: RentalsPageProps = {}) {
  const { can } = useAuth();
  const { formatCurrency, formatDateTime, settings, t } = useI18n();
  const [needsFormOptions, setNeedsFormOptions] = useState(false);
  const [queue, setQueue] = useState<RentalQueue>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [panelState, setPanelState] = useState<RentalPanelState>(null);
  // Failures raised by an action; failed loads are derived from the queries.
  const [actionListError, setActionListError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionPaymentError, setActionPaymentError] = useState<string | null>(null);
  const [contractPrintAction, setContractPrintAction] = useState<PrintAction | null>(null);
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null);
  const [pendingReturnPayment, setPendingReturnPayment] =
    useState<RentalReturnInput | null>(null);
  const [returnPaymentError, setReturnPaymentError] = useState<string | null>(null);
  const [returnByPlateOpen, setReturnByPlateOpen] = useState(false);
  const [returnByPlateValue, setReturnByPlateValue] = useState("");
  const [returnByPlateError, setReturnByPlateError] = useState<string | null>(null);
  const [isFindingByPlate, setIsFindingByPlate] = useState(false);
  const [rentalToCancel, setRentalToCancel] = useState<RentalListRecord | null>(null);
  const [paymentToVoid, setPaymentToVoid] = useState<PendingVoidPayment>(null);
  const handledWorkflowRequestKey = useRef<string | number | null>(null);

  const queryClient = useQueryClient();
  // The same 150 ms wait as before; queue and page complete the key.
  const debouncedSearch = useDebouncedValue(search, 150);
  const listRequest = { page, queue, search: debouncedSearch };
  const listKey = useBusinessQueryKey("rentals", "list", listRequest);
  const rentalsQuery = useBusinessQuery(
    "rentals",
    "list",
    listRequest,
    () => rentalAppApi.rentals.list(listRequest),
  );
  const rentalPage = rentalsQuery.data ?? emptyRentalPage;
  const isLoading = rentalsQuery.isPending;
  const listError = actionListError ??
    (rentalsQuery.isError
      ? getErrorMessage(rentalsQuery.error, t("Rentals could not be loaded."))
      : null);

  /**
   * A write invalidates the business root and waits for it, so by the time a
   * mutation resolves the list entry already holds the post-write rows. Reading
   * them from the cache is what lets the side panel re-select the rental it was
   * showing without asking the main process a second time.
   */
  function currentRentalRows(): RentalListRecord[] {
    return (
      queryClient.getQueryData<PageResult<RentalListRecord, RentalListSummary>>(
        listKey,
      )?.rows ?? []
    );
  }

  // Loaded only when a form needs them, exactly as the old lazy call did.
  const formOptionsKey = useBusinessQueryKey("rentals", "formOptions");
  const optionsQuery = useBusinessQuery<RentalFormOptions>(
    "rentals",
    "formOptions",
    undefined,
    () => rentalAppApi.rentals.getFormOptions(),
    { enabled: needsFormOptions },
  );
  const options = optionsQuery.data ?? emptyFormOptions;

  // The payments shown beside a rental, fetched only while that panel is open.
  const paymentsRentalId = panelState && "rental" in panelState
    ? panelState.rental.id
    : null;
  const paymentsQuery = useBusinessQuery(
    "payments",
    "listForRental",
    paymentsRentalId ?? 0,
    () => rentalAppApi.payments.listForRental(paymentsRentalId!),
    { enabled: paymentsRentalId !== null },
  );
  const paymentRecords = paymentsQuery.data ?? [];
  const paymentError = actionPaymentError ??
    (paymentsRentalId !== null && paymentsQuery.isError
      ? getErrorMessage(paymentsQuery.error, t("Payments could not be loaded."))
      : null);

  const activateRental = useBusinessMutation((input: RentalActivationInput) =>
    rentalAppApi.rentals.activate(input),
  );
  const createDraft = useBusinessMutation((input: RentalActivationInput) =>
    rentalAppApi.rentals.createDraft(input),
  );
  const activateDraft = useBusinessMutation((rentalId: number) =>
    rentalAppApi.rentals.activateDraft(rentalId),
  );
  const returnRental = useBusinessMutation((input: RentalReturnInput) =>
    rentalAppApi.rentals.return(input),
  );
  const returnWithPayment = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.rentals.returnWithPayment>[0]) =>
      rentalAppApi.rentals.returnWithPayment(input),
  );
  const cancelRental = useBusinessMutation(
    (input: { approvalToken?: string; rentalId: number; reason: string }) =>
      rentalAppApi.rentals.cancel(input),
  );
  const createPayment = useBusinessMutation((input: PaymentInput) =>
    rentalAppApi.payments.create(input),
  );
  const voidPayment = useBusinessMutation(
    (input: { approvalToken?: string; paymentId: number; reason: string }) =>
      rentalAppApi.payments.void(input),
  );
  // Printing and plate lookup change nothing.
  const printReceipt = useCommandMutation((paymentId: number) =>
    rentalAppApi.payments.printReceipt(paymentId, false),
  );
  const printContract = useCommandMutation(
    ({ rentalId, printToPDF }: { rentalId: number; printToPDF: boolean }) =>
      rentalAppApi.rentals.printContract(rentalId, printToPDF),
  );
  const findOpenByPlate = useCommandMutation((plateNumber: string) =>
    rentalAppApi.rentals.findOpenByPlate(plateNumber),
  );

  const openCreateForm = useCallback(async () => {
    setFormError(null);
    setNeedsFormOptions(true);
    // `fetchQuery`, not `ensureQueryData`: the latter hands back whatever is
    // cached without checking whether it is still valid, so a form opened after
    // a vehicle was rented or a customer deactivated would offer options that
    // no longer exist. The list has to be current before the form appears.
    await queryClient.fetchQuery({
      queryKey: formOptionsKey,
      queryFn: () => rentalAppApi.rentals.getFormOptions(),
      staleTime: 0,
    });
    setPanelState({ mode: "create" });
  }, [formOptionsKey, queryClient]);

  useEffect(() => {
    if (!workflowRequest) {
      handledWorkflowRequestKey.current = null;
      return;
    }

    const requestKey = workflowRequestKey ?? workflowRequest;

    if (handledWorkflowRequestKey.current === requestKey) {
      return;
    }

    handledWorkflowRequestKey.current = requestKey;

    const timeout = window.setTimeout(() => {
      if (workflowRequest === "create") {
        void openCreateForm();
        return;
      }

      setPanelState(null);
      setQueue("active");
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [openCreateForm, workflowRequest, workflowRequestKey]);

  const summary = rentalPage.summary ?? emptySummary;
  const countedQueueTabs = queueTabs.map((tab) => ({
    ...tab,
    count:
      tab.value === "active"
        ? summary.active
        : tab.value === "overdue"
          ? summary.overdue
          : tab.value === "returned"
            ? summary.returned
            : tab.value === "all"
              ? summary.total
              : undefined,
    tone: tab.value === "overdue" ? ("danger" as const) : ("default" as const),
  }));

  async function handleActivateRental(input: RentalActivationInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await activateRental.mutateAsync(input);
      setPanelState(null);
      setPage(1);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Rental could not be activated.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateDraftRental(input: RentalActivationInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await createDraft.mutateAsync(input);
      setPanelState(null);
      setQueue("all");
      setPage(1);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Rental could not be saved as draft.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivateDraftRental(rental: RentalListRecord) {
    setIsSaving(true);
    setActionListError(null);
    setPanelError(null);
    setPanelNotice(null);

    try {
      const activated = await activateDraft.mutateAsync(rental.id);
      setPanelState({ mode: "detail", rental: activated });
    } catch (error) {
      const message = getErrorMessage(error, t("Rental could not be activated."));
      setPanelError(message);
      setActionListError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReturnRental(input: RentalReturnInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await returnRental.mutateAsync(input);
      setPanelState(null);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Rental could not be returned.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReturnRentalWithPayment(
    input: RentalReturnInput,
    amount: number,
  ): Promise<boolean> {
    setIsSaving(true);
    setReturnPaymentError(null);

    try {
      const result = await returnWithPayment.mutateAsync({
        returnInput: input,
        paymentInput: {
          rentalId: input.rentalId,
          type: "rent",
          method: "cash",
          amount,
          paymentDate: new Date().toISOString(),
          notes: "Final payment at return.",
        },
      });
      setPanelState(null);

      if (settings.autoPrintReceipt && result.payment) {
        printReceipt.mutateAsync(result.payment.id).catch((error: unknown) => {
          setFormError(getErrorMessage(error, t("Operation Failed")));
        });
      }

      return true;
    } catch (error) {
      setReturnPaymentError(getErrorMessage(error, t("Rental could not be returned.")));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelRental(
    rental: RentalListRecord,
    values: { approvalToken?: string; reason?: string },
  ) {
    setIsSaving(true);
    setActionListError(null);

    try {
      await cancelRental.mutateAsync({
        approvalToken: values.approvalToken,
        rentalId: rental.id,
        reason: values.reason ?? "",
      });
      setPanelState(null);
    } catch (error) {
      setActionListError(getErrorMessage(error, t("Rental could not be cancelled.")));
    } finally {
      setIsSaving(false);
      setRentalToCancel(null);
    }
  }

  async function handleCreatePayment(input: PaymentInput) {
    setIsSaving(true);
    setActionPaymentError(null);

    try {
      const payment = await createPayment.mutateAsync(input);
      const updatedRental = currentRentalRows().find(
        (rental) => rental.id === input.rentalId,
      );

      if (updatedRental) {
        setPanelState({ mode: "payment", rental: updatedRental });
      }

      if (settings.autoPrintReceipt) {
        printReceipt.mutateAsync(payment.id).catch((error: unknown) => {
          setActionPaymentError(getErrorMessage(error, t("Operation Failed")));
        });
      }
    } catch (error) {
      setActionPaymentError(getErrorMessage(error, t("Payment could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVoidPayment(values: {
    approvalToken?: string;
    reason?: string;
  }) {
    if (!paymentToVoid || !values.reason) {
      return;
    }

    const payment = paymentToVoid;
    setIsSaving(true);
    setActionPaymentError(null);

    try {
      await voidPayment.mutateAsync({
        approvalToken: values.approvalToken,
        paymentId: payment.id,
        reason: values.reason,
      });
      const updatedRental = currentRentalRows().find(
        (rental) => rental.id === payment.rentalId,
      );

      if (updatedRental) {
        setPanelState({ mode: "payment", rental: updatedRental });
      }
    } catch (error) {
      setActionPaymentError(getErrorMessage(error, t("Payment could not be voided.")));
    } finally {
      setIsSaving(false);
      setPaymentToVoid(null);
    }
  }

  async function openDetailPanel(rental: RentalListRecord) {
    setPanelError(null);
    setPanelNotice(null);
    setActionPaymentError(null);
    setPanelState({ mode: "detail", rental });
  }

  function openReturnForm(rental: RentalListRecord) {
    setFormError(null);
    setPanelState({ mode: "return", rental });
  }

  async function openPaymentPanel(rental: RentalListRecord) {
    setActionPaymentError(null);
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

  async function handlePrintContract(rentalId: number, printToPDF: boolean) {
    setContractPrintAction(printToPDF ? "pdf" : "print");
    setPanelError(null);
    setPanelNotice(null);

    try {
      const result = await printContract.mutateAsync({ rentalId, printToPDF });
      setPanelNotice(
        result.status === "printed"
          ? "Contract sent to printer."
          : result.status === "saved"
            ? "Contract PDF saved successfully."
            : "Printing was cancelled.",
      );
    } catch (error) {
      setPanelError(getErrorMessage(error, t("Operation Failed")));
    } finally {
      setContractPrintAction(null);
    }
  }

  async function handleFindReturnByPlate() {
    const plateNumber = returnByPlateValue.trim();

    if (!plateNumber) {
      setReturnByPlateError("Plate number is required.");
      return;
    }

    setIsFindingByPlate(true);
    setReturnByPlateError(null);
    setActionListError(null);

    try {
      const rental = await findOpenByPlate.mutateAsync(plateNumber);
      setReturnByPlateOpen(false);
      setReturnByPlateValue("");
      openReturnForm(rental);
    } catch (error) {
      setReturnByPlateError(
        getErrorMessage(error, t("No active rental was found for this plate number.")),
      );
    } finally {
      setIsFindingByPlate(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        actions={(
          <>
            {can("rentals.return") ? (
              <Button
                variant="outline"
                onClick={() => {
                  setReturnByPlateError(null);
                  setReturnByPlateOpen(true);
                }}
              >
                <RotateCcw data-icon="inline-start" />
                {t("Return by Plate")}
              </Button>
            ) : null}
            {can("rentals.create") ? (
              <Button onClick={() => void openCreateForm()}>
                <Plus data-icon="inline-start" />
                {t("New Rental")}
              </Button>
            ) : null}
          </>
        )}
      >
        <SearchInput
          placeholder={t("Search contract, customer, or plate")}
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
        />
      </ListToolbar>

      <div className="flex flex-wrap gap-2">
        <SegmentedFilter
          options={countedQueueTabs}
          t={t}
          value={queue}
          onChange={handleQueueChange}
        />
      </div>

      <SidePanel
        open={Boolean(panelState)}
        title={getPanelTitle(panelState, t)}
        description={getPanelDescription(panelState, t)}
        width={panelState?.mode === "detail" ? "md" : "lg"}
        onClose={() => setPanelState(null)}
      >
        {panelState?.mode === "create" ? (
          <RentalForm
            error={formError}
            isSaving={isSaving}
            options={options}
            onCancel={() => setPanelState(null)}
            onSave={handleActivateRental}
            onSaveDraft={handleCreateDraftRental}
          />
        ) : null}

        {panelState?.mode === "detail" ? (
          <RentalDetailPanel
            currency={settings.defaultCurrency}
            formatCurrency={formatCurrency}
            formatDateTime={formatDateTime}
            isSaving={isSaving}
            contractPrintAction={contractPrintAction}
            panelError={panelError}
            panelNotice={panelNotice}
            paymentError={paymentError}
            payments={paymentRecords}
            rental={panelState.rental}
            t={t}
            onActivateDraft={
              can("rentals.create")
                ? () => void handleActivateDraftRental(panelState.rental)
                : undefined
            }
            onCancelRental={can("rentals.cancel") ? () => setRentalToCancel(panelState.rental) : undefined}
            onPrintContract={(printToPDF) =>
              void handlePrintContract(panelState.rental.id, printToPDF)
            }
            onRecordPayment={can("payments.create") ? () => void openPaymentPanel(panelState.rental) : undefined}
            onReturnVehicle={can("rentals.return") ? () => openReturnForm(panelState.rental) : undefined}
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
            onSaveWithPayment={(input) => {
              setReturnPaymentError(null);
              setPendingReturnPayment(input);
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
            onVoidPayment={can("payments.void") ? async (payment) => setPaymentToVoid(payment) : undefined}
          />
        ) : null}
      </SidePanel>

      <section className="overflow-hidden rounded-2xl border border-border/40 bg-card/75 shadow-xs">
        {listError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(listError)}
          </div>
        ) : null}

        <DataTable className="min-w-[900px]" containerClassName="rounded-none border-0 shadow-none">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <Th>{t("Contract")}</Th>
              <Th>{t("Customer")}</Th>
              <Th>{t("Vehicle")}</Th>
              <Th>{t("Due / Returned")}</Th>
              <Th className="text-end">{t("Balance due")}</Th>
              <Th>{t("Status")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={7} message={t("Loading rentals...")} state="loading" />
            ) : rentalPage.rows.length === 0 ? (
              <EmptyTableRow
                colSpan={7}
                message={search.trim() ? t("No rentals match this search.") : t("No rentals yet")}
                description={
                  search.trim()
                    ? t("Search by contract number, customer name, or plate number.")
                    : t("Use New Rental to activate the first rental.")
                }
              />
            ) : (
              rentalPage.rows.map((rental) => (
                <tr
                  key={rental.id}
                  className={cn(
                    "transition-colors hover:bg-muted/40 focus-within:bg-muted/40",
                    rental.status === "overdue" && "bg-destructive/5",
                    rental.status === "active" && "bg-primary/[0.025]",
                  )}
                >
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
                  <Td className="text-end">
                    <MoneyText
                      amount={rental.remainingAmount}
                      formatCurrency={formatCurrency}
                      showCreditLabel
                      t={t}
                    />
                  </Td>
                  <Td>
                    <RentalStatusBadge status={rental.status} />
                  </Td>
                  <Td className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      {canOperateRental(rental) ? (
                        <>
                          {can("rentals.return") ? (
                            <Button size="sm" onClick={() => openReturnForm(rental)}>
                              <CheckCircle2 data-icon="inline-start" />
                              {t("Return Vehicle")}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      {rental.status === "draft" && can("rentals.create") ? (
                        <Button
                          size="sm"
                          disabled={isSaving}
                          onClick={() => void handleActivateDraftRental(rental)}
                        >
                          <CheckCircle2 data-icon="inline-start" />
                          {t("Activate Rental")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
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

      <SensitiveActionDialog
        action="rentals.cancel"
        open={Boolean(rentalToCancel)}
        title={t("Cancel rental?")}
        description={t("Cancel rental confirmation")}
        ownerPinRequired={settings.ownerPinEnabled}
        reasonLabel={t("Reason")}
        cancelLabel={t("Keep Rental")}
        confirmLabel={t("Cancel Rental")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setRentalToCancel(null)}
        onConfirm={(values) => {
          if (rentalToCancel) {
            void handleCancelRental(rentalToCancel, values);
          }
        }}
      />

      <SensitiveActionDialog
        action="payments.void"
        open={Boolean(paymentToVoid)}
        title={t("Void Payment")}
        description={t("Enter the void reason and owner PIN if required.")}
        ownerPinRequired={settings.ownerPinEnabled}
        reasonLabel={t("Void reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Void Payment")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setPaymentToVoid(null)}
        onConfirm={(values) => void handleVoidPayment(values)}
      />

      <ReturnByPlateDialog
        error={returnByPlateError}
        isBusy={isFindingByPlate}
        onCancel={() => {
          setReturnByPlateOpen(false);
          setReturnByPlateError(null);
          setReturnByPlateValue("");
        }}
        onConfirm={() => void handleFindReturnByPlate()}
        onPlateNumberChange={(value) => {
          setReturnByPlateValue(value);
          setReturnByPlateError(null);
        }}
        open={returnByPlateOpen}
        plateNumber={returnByPlateValue}
        t={t}
      />

      <FinalPaymentDialog
        currency={settings.defaultCurrency}
        error={returnPaymentError}
        isBusy={isSaving}
        onCancel={() => {
          setPendingReturnPayment(null);
          setReturnPaymentError(null);
        }}
        onConfirm={async (amount) => {
          if (!pendingReturnPayment) {
            return false;
          }

          const didReturn = await handleReturnRentalWithPayment(
            pendingReturnPayment,
            amount,
          );

          if (didReturn) {
            setPendingReturnPayment(null);
          }

          return didReturn;
        }}
        open={Boolean(pendingReturnPayment)}
        t={t}
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
  contractPrintAction,
  currency,
  formatCurrency,
  formatDateTime,
  isSaving,
  onActivateDraft,
  onCancelRental,
  onPrintContract,
  onRecordPayment,
  onReturnVehicle,
  panelError,
  panelNotice,
  paymentError,
  payments,
  rental,
  t,
}: {
  contractPrintAction: PrintAction | null;
  currency: string;
  formatCurrency: (amount: number) => string;
  formatDateTime: (value: string | Date) => string;
  isSaving: boolean;
  onActivateDraft?: () => void;
  onCancelRental?: () => void;
  onPrintContract: (printToPDF: boolean) => void;
  onRecordPayment?: () => void;
  onReturnVehicle?: () => void;
  panelError: string | null;
  panelNotice: string | null;
  paymentError: string | null;
  payments: PaymentRecord[];
  rental: RentalListRecord;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const canOperate = canOperateRental(rental);
  const isPrinting = contractPrintAction !== null;

  return (
    <div className="flex flex-col gap-5">
      {panelError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(panelError)}
        </div>
      ) : null}

      {panelNotice ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {t(panelNotice)}
        </div>
      ) : null}

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
          <DetailItem
            label={rental.remainingAmount < 0 ? t("Credit") : t("Balance due")}
            value={(
              <MoneyText
                amount={rental.remainingAmount}
                formatCurrency={formatCurrency}
              />
            )}
            alignEnd
          />
        </div>
      </div>

      {rental.accessories?.length ? (
        <div className="rounded-md border">
          <div className="border-b px-4 py-3 font-medium">{t("Accessories")}</div>
          <div className="divide-y">
            {rental.accessories.map((accessory) => (
              <div
                key={accessory.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-medium">{accessory.accessoryName}</p>
                  {accessory.notes ? (
                    <p className="text-xs text-muted-foreground">{accessory.notes}</p>
                  ) : null}
                </div>
                <DetailItem
                  label={t("Quantity")}
                  value={`${accessory.quantity}`}
                  alignEnd
                />
                <DetailItem
                  label={t("Charge")}
                  value={<BidiValue value={formatCurrency(accessory.quantity * accessory.unitCharge)} />}
                  alignEnd
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {rental.collateralItems?.length ? (
        <div className="rounded-md border">
          <div className="border-b px-4 py-3 font-medium">{t("Amanat Held")}</div>
          <div className="divide-y">
            {rental.collateralItems.map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-3">
                <DetailItem
                  label={t(formatCollateralType(item.type, "en"))}
                  value={item.description}
                />
                <DetailItem
                  label={t("Reference")}
                  value={item.referenceNumber ? <BidiValue value={item.referenceNumber} /> : t("No reference")}
                />
                <DetailItem
                  label={t("Status")}
                  value={t(item.status === "returned" ? "Returned" : "Held")}
                />
                {item.notes ? (
                  <div className="sm:col-span-3 text-sm text-muted-foreground">
                    {item.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
        </div>
        {paymentError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(paymentError)}
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
                  className={`text-end font-semibold ${payment.type === "refund" ? "text-warning" : ""}`}
                  value={`${payment.type === "refund" ? "-" : ""}${formatCurrency(payment.amount)}`}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-col gap-3 border-t bg-card px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {canOperate && onReturnVehicle ? (
            <Button onClick={onReturnVehicle}>
              <CheckCircle2 data-icon="inline-start" />
              {t("Return Vehicle")}
            </Button>
          ) : null}
          {rental.status === "draft" && onActivateDraft ? (
            <Button disabled={isSaving} onClick={onActivateDraft}>
              <CheckCircle2 data-icon="inline-start" />
              {t("Activate Rental")}
            </Button>
          ) : null}
          {onRecordPayment ? (
            <Button variant="outline" onClick={onRecordPayment}>
              <CreditCard data-icon="inline-start" />
              {t("Record Payment")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={isPrinting}
            onClick={() => onPrintContract(false)}
          >
            {contractPrintAction === "print" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer data-icon="inline-start" />
            )}
            {t("Print Contract")}
          </Button>
          <Button
            variant="outline"
            disabled={isPrinting}
            onClick={() => onPrintContract(true)}
          >
            {contractPrintAction === "pdf" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown data-icon="inline-start" />
            )}
            {t("PDF")}
          </Button>
        </div>
        <div className="flex justify-start sm:justify-end">
          {canOperate && onCancelRental ? (
            <Button
              className="border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isSaving}
              variant="outline"
              onClick={onCancelRental}
            >
              <XCircle data-icon="inline-start" />
              {t("Cancel Rental")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReturnByPlateDialog({
  error,
  isBusy,
  onCancel,
  onConfirm,
  onPlateNumberChange,
  open,
  plateNumber,
  t,
}: {
  error: string | null;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onPlateNumberChange: (value: string) => void;
  open: boolean;
  plateNumber: string;
  t: (key: string) => string;
}) {
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <form
        ref={dialogRef}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 className="text-base font-semibold">{t("Return vehicle by plate")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("Enter a plate number to find the active rental.")}
        </p>

        <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
          <span>{t("Plate")}</span>
          <Input
            autoFocus
            aria-invalid={Boolean(error)}
            data-ltr="true"
            value={plateNumber}
            onChange={(event) => onPlateNumberChange(event.target.value)}
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(error)}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={isBusy || plateNumber.trim().length === 0}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Find Rental")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FinalPaymentDialog({
  currency,
  error,
  isBusy,
  onCancel,
  onConfirm,
  open,
  t,
}: {
  currency: string;
  error: string | null;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (amount: number) => Promise<boolean>;
  open: boolean;
  t: (key: string) => string;
}) {
  const [amountText, setAmountText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: cancel,
    open,
  });

  if (!open) {
    return null;
  }

  function cancel() {
    setAmountText("");
    setValidationError(null);
    onCancel();
  }

  async function submit() {
    const normalizedAmount = Number(
      normalizeDigits(amountText).trim().replace(",", "."),
    );

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setValidationError("Amount must be more than zero.");
      return;
    }

    setValidationError(null);
    const didReturn = await onConfirm(normalizedAmount);

    if (didReturn) {
      setAmountText("");
    }
  }

  const displayError = validationError ?? error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <form
        ref={dialogRef}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-base font-semibold">
          {t("Return vehicle and record payment")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("Enter the payment collected at return.")}
        </p>

        <div className="mt-4 rounded-md border bg-muted/25 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("Currency")}: </span>
          <BidiValue className="font-semibold" value={currency} />
        </div>

        <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
          <span>{t("Final payment amount")}</span>
          <Input
            autoFocus
            aria-invalid={Boolean(displayError)}
            data-ltr="true"
            inputMode="decimal"
            value={amountText}
            onChange={(event) => {
              setAmountText(event.target.value);
              setValidationError(null);
            }}
          />
        </label>

        {displayError ? (
          <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(displayError)}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel} disabled={isBusy}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={isBusy || amountText.trim().length === 0}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Record Payment and Return")}
          </Button>
        </div>
      </form>
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
): ReactNode {
  if (panelState?.mode === "detail") {
    return (
      <>
        <BidiValue value={panelState.rental.contractNo} /> ·{" "}
        <span dir="auto">{panelState.rental.customerName}</span> ·{" "}
        <BidiValue value={panelState.rental.vehiclePlateNumber} />
      </>
    );
  }

  if (panelState?.mode === "return") {
    return (
      <>
        <BidiValue value={panelState.rental.contractNo} /> ·{" "}
        <BidiValue value={panelState.rental.vehiclePlateNumber} /> ·{" "}
        <span dir="auto">{panelState.rental.customerName}</span>
      </>
    );
  }

  if (panelState?.mode === "payment") {
    return (
      <>
        <BidiValue value={panelState.rental.contractNo} /> ·{" "}
        <span dir="auto">{panelState.rental.customerName}</span> ·{" "}
        <BidiValue value={panelState.rental.vehiclePlateNumber} />
      </>
    );
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
