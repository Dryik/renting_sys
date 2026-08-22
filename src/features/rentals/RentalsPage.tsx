import { CheckCircle2, Info, Pencil, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
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
import { cn } from "@/lib/utils";
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
import { ActivateDraftDialog } from "./ActivateDraftDialog";
import { FinalPaymentDialog } from "./FinalPaymentDialog";
import { RentalDetailPanel } from "./RentalDetailPanel";
import { RentalExtendDialog } from "./RentalExtendDialog";
import { ReplaceVehicleDialog } from "./ReplaceVehicleDialog";
import { ReturnByPlateDialog } from "./ReturnByPlateDialog";
import {
  canOperateRental,
  getErrorMessage,
  getPanelDescription,
  getPanelTitle,
  type PrintAction,
  type RentalPanelState,
} from "./rental-panel-helpers";
import { RentalForm } from "./RentalForm";
import { RentalPaymentPanel } from "./RentalPaymentPanel";
import { RentalReturnForm } from "./RentalReturnForm";
import { RentalStatusBadge } from "./RentalStatusBadge";

export type RentalWorkflowRequest = "create" | "return";

type RentalsPageProps = {
  workflowRequest?: RentalWorkflowRequest | null;
  workflowRequestKey?: string | number;
};

type PendingReturn = RentalReturnInput;
type PendingVoidPayment = PaymentRecord | null;

const emptySummary: RentalListSummary = {
  total: 0,
  active: 0,
  draft: 0,
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
  { value: "draft", label: "Draft" },
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
  const { formatCurrency, formatDate, formatDateTime, settings, t } = useI18n();
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
  const [rentalToActivate, setRentalToActivate] = useState<RentalListRecord | null>(null);
  const [rentalToExtend, setRentalToExtend] = useState<RentalListRecord | null>(null);
  const [rentalToReplaceVehicle, setRentalToReplaceVehicle] =
    useState<RentalListRecord | null>(null);
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
  const updateDraft = useBusinessMutation(
    ({ id, input }: { id: number; input: RentalActivationInput }) =>
      rentalAppApi.rentals.updateDraft(id, input),
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
  const extendRental = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.rentals.extend>[0]) =>
      rentalAppApi.rentals.extend(input),
  );
  const replaceRentalVehicle = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.rentals.replaceVehicle>[0]) =>
      rentalAppApi.rentals.replaceVehicle(input),
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

  const openEditDraftForm = useCallback(
    async (rental: RentalListRecord) => {
      setFormError(null);
      setNeedsFormOptions(true);
      await queryClient.fetchQuery({
        queryKey: formOptionsKey,
        queryFn: () => rentalAppApi.rentals.getFormOptions(),
        staleTime: 0,
      });
      setPanelState({ mode: "edit-draft", rental });
    },
    [formOptionsKey, queryClient],
  );

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
        : tab.value === "draft"
          ? summary.draft
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

  async function handleUpdateDraftRental(
    rentalId: number,
    input: RentalActivationInput,
  ) {
    setIsSaving(true);
    setFormError(null);

    try {
      const updated = await updateDraft.mutateAsync({ id: rentalId, input });
      setPanelState({ mode: "detail", rental: updated });
    } catch (error) {
      setFormError(
        getErrorMessage(error, t("Rental could not be saved as draft.")),
      );
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
        width={panelState?.mode === "detail" ? "md" : "xl"}
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

        {panelState?.mode === "edit-draft" ? (
          <RentalForm
            initialRental={panelState.rental}
            error={formError}
            isSaving={isSaving}
            options={options}
            onCancel={() =>
              setPanelState({ mode: "detail", rental: panelState.rental })
            }
            onSave={(input) =>
              handleUpdateDraftRental(panelState.rental.id, input)
            }
            onSaveDraft={(input) =>
              handleUpdateDraftRental(panelState.rental.id, input)
            }
          />
        ) : null}

        {panelState?.mode === "detail" ? (
          <RentalDetailPanel
            currency={settings.defaultCurrency}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
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
                ? () => setRentalToActivate(panelState.rental)
                : undefined
            }
            onCancelRental={can("rentals.cancel") ? () => setRentalToCancel(panelState.rental) : undefined}
            onEditDraft={
              can("rentals.create")
                ? () => void openEditDraftForm(panelState.rental)
                : undefined
            }
            onExtendRental={
              can("rentals.editActive")
                ? () => setRentalToExtend(panelState.rental)
                : undefined
            }
            onReplaceVehicle={
              can("rentals.editActive")
                ? () => {
                    // The picker needs the available-vehicle list, which is
                    // fetched only once a form asks for it.
                    setNeedsFormOptions(true);
                    setRentalToReplaceVehicle(panelState.rental);
                  }
                : undefined
            }
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
                      value={formatDate(
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
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSaving}
                            onClick={() => void openEditDraftForm(rental)}
                          >
                            <Pencil data-icon="inline-start" />
                            {t("Edit Draft")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={isSaving}
                            onClick={() => setRentalToActivate(rental)}
                          >
                            <CheckCircle2 data-icon="inline-start" />
                            {t("Activate Rental")}
                          </Button>
                        </>
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

      <ActivateDraftDialog
        formatCurrency={formatCurrency}
        formatDateTime={formatDateTime}
        isBusy={isSaving}
        open={Boolean(rentalToActivate)}
        rental={rentalToActivate}
        t={t}
        onCancel={() => setRentalToActivate(null)}
        onConfirm={async () => {
          if (!rentalToActivate) return;
          const target = rentalToActivate;
          setRentalToActivate(null);
          await handleActivateDraftRental(target);
        }}
        onEditDraft={() => {
          if (!rentalToActivate) return;
          const target = rentalToActivate;
          setRentalToActivate(null);
          void openEditDraftForm(target);
        }}
      />

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

      <RentalExtendDialog
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        isBusy={extendRental.isPending}
        onCancel={() => setRentalToExtend(null)}
        onConfirm={async (input, printFirstPageOnly) => {
          setActionListError(null);
          try {
            const result = await extendRental.mutateAsync(input);
            setRentalToExtend(null);
            if (
              panelState?.mode === "detail" &&
              panelState.rental.id === input.rentalId
            ) {
              setPanelState({ mode: "detail", rental: result.rental });
              setPanelNotice(t("Contract extended successfully"));
            }
            if (printFirstPageOnly) {
              try {
                await rentalAppApi.rentals.printContract(
                  result.rental.id,
                  false,
                  undefined,
                  true,
                );
              } catch (error) {
                console.error("Failed to print extension contract:", error);
              }
            }
            return true;
          } catch (error) {
            setActionListError(
              getErrorMessage(error, t("Rental could not be extended.")),
            );
            return false;
          }
        }}
        open={Boolean(rentalToExtend)}
        rental={rentalToExtend}
        t={t}
      />

      <ReplaceVehicleDialog
        formatCurrency={formatCurrency}
        formatDateTime={formatDateTime}
        isBusy={replaceRentalVehicle.isPending}
        onCancel={() => setRentalToReplaceVehicle(null)}
        onConfirm={async (input, printContract) => {
          setActionListError(null);
          try {
            const updated = await replaceRentalVehicle.mutateAsync(input);
            setRentalToReplaceVehicle(null);
            if (
              panelState?.mode === "detail" &&
              panelState.rental.id === input.rentalId
            ) {
              setPanelState({ mode: "detail", rental: updated });
              setPanelNotice(t("Vehicle replaced successfully"));
            }
            if (printContract) {
              try {
                await rentalAppApi.rentals.printContract(updated.id, false);
              } catch (error) {
                console.error("Failed to print updated contract:", error);
              }
            }
            return true;
          } catch (error) {
            setActionListError(
              getErrorMessage(error, t("The vehicle could not be replaced.")),
            );
            return false;
          }
        }}
        open={Boolean(rentalToReplaceVehicle)}
        rental={rentalToReplaceVehicle}
        t={t}
        vehicles={options.vehicles}
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
