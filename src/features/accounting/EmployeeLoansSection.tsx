import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import {
  employeeLoanFormSchema,
  employeeLoanRepaymentFormSchema,
  getDefaultEmployeeLoanFormValues,
  getDefaultEmployeeLoanRepaymentFormValues,
  type EmployeeLoanEmployeeOption,
  type EmployeeLoanFormValues,
  type EmployeeLoanInput,
  type EmployeeLoanRecord,
  type EmployeeLoanRepaymentFormValues,
} from "@/shared/employee-loans";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Plus,
} from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/ui/search-input";
import { SectionPanel } from "@/components/ui/section-panel";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import {
  formatMoneyLocation,
  moneyLocationValues,
} from "@/shared/accounting";
import { rentalAppApi } from "@/data/rental-app-api";
import { useAuth } from "@/hooks/useAuth";
import {
  useBusinessMutation,
  useBusinessQuery,
} from "@/data/hooks";
import { useDebouncedValue } from "@/data/useDebouncedValue";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useI18n } from "@/hooks/useI18n";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "./accounting-forms";
import { emptyEmployeeLoanPage, getErrorMessage, rowClassName, type EmployeeLoanRepaymentFormInput } from "./accounting-shared";
import { DailyItem } from "./accounting-tables";

/**
 * Employee advances and repayments. Owns its own list query and mutations,
 * as it did when it lived inside the accounting page.
 */
export function EmployeeLoansSection() {
  const { can } = useAuth();
  const { formatCurrency, formatDateTime, language, t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<
    | { type: "create" }
    | { type: "repay"; loan: EmployeeLoanRecord }
    | null
  >(null);
  const [pendingVoidLoan, setPendingVoidLoan] =
    useState<EmployeeLoanRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // The list and the employee options load together, as they did before, so the
  // section fills in one step. The same 150 ms search wait applies.
  const filterInput = useMemo(() => ({ page, search }), [page, search]);
  const filters = useDebouncedValue(filterInput, 150);
  const loansQuery = useBusinessQuery(
    "employeeLoans",
    "overview",
    filters,
    async () => {
      const [nextLoans, nextEmployees] = await Promise.all([
        rentalAppApi.employeeLoans.list({
          page: filters.page,
          search: filters.search,
        }),
        rentalAppApi.employeeLoans.listEmployees(),
      ]);

      return { loanPage: nextLoans, employees: nextEmployees };
    },
  );
  const loanPage = loansQuery.data?.loanPage ?? emptyEmployeeLoanPage;
  const employees = loansQuery.data?.employees ?? [];
  const isLoading = loansQuery.isPending;
  const error = actionError ??
    (loansQuery.isError
      ? getErrorMessage(loansQuery.error, t("Employee loans could not be loaded."))
      : null);

  const createLoan = useBusinessMutation((input: EmployeeLoanInput) =>
    rentalAppApi.employeeLoans.create(input),
  );
  const repayLoan = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.employeeLoans.repay>[0]) =>
      rentalAppApi.employeeLoans.repay(input),
  );
  const voidLoan = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.employeeLoans.void>[0]) =>
      rentalAppApi.employeeLoans.void(input),
  );

  async function handleCreateLoan(input: EmployeeLoanInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await createLoan.mutateAsync(input);
      setPanel(null);
    } catch (err) {
      setFormError(getErrorMessage(err, t("Employee loan could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRepayLoan(
    loan: EmployeeLoanRecord,
    input: EmployeeLoanRepaymentFormInput,
  ) {
    setIsSaving(true);
    setFormError(null);

    try {
      await repayLoan.mutateAsync({ ...input, loanId: loan.id });
      setPanel(null);
    } catch (err) {
      setFormError(getErrorMessage(err, t("Loan repayment could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVoidLoan(values: { approvalToken?: string; reason?: string }) {
    if (!pendingVoidLoan || !values.reason) {
      return;
    }

    setIsSaving(true);
    setActionError(null);

    try {
      await voidLoan.mutateAsync({
        loanId: pendingVoidLoan.id,
        reason: values.reason,
        approvalToken: values.approvalToken,
      });
      setPendingVoidLoan(null);
    } catch (err) {
      setActionError(getErrorMessage(err, t("Employee loan could not be voided.")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SectionPanel
      title={t("Employee Loans")}
      description={t("Track employee advances and repayments without counting them as rental income.")}
      badge={t("{{count}} shown", { count: loanPage.total })}
    >
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border/70 bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          className="w-full lg:max-w-sm"
          placeholder={t("Search loans")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {can("employeeLoans.create") ? (
          <Button type="button" onClick={() => setPanel({ type: "create" })}>
            <Plus data-icon="inline-start" />
            {t("New Loan")}
          </Button>
        ) : null}
      </div>

      <DataTable className="min-w-[860px]" containerClassName="min-h-[22rem]">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <Th>{t("Loan No.")}</Th>
            <Th>{t("Employee")}</Th>
            <Th>{t("Date")}</Th>
            <Th>{t("Source")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-end">{t("Amount")}</Th>
            <Th className="text-end">{t("Remaining")}</Th>
            <Th className="text-end">{t("Actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyTableRow colSpan={8} message={t("Loading loans...")} state="loading" />
          ) : loanPage.rows.length === 0 ? (
            <EmptyTableRow colSpan={8} message={t("No employee loans found.")} />
          ) : (
            loanPage.rows.map((loan) => (
              <tr key={loan.id} className={rowClassName}>
                <Td className="font-medium">{loan.loanNo}</Td>
                <Td>{loan.employeeName}</Td>
                <Td className="tabular-nums">
                  <BidiValue value={formatDateTime(loan.issuedAt)} />
                </Td>
                <Td>{formatMoneyLocation(loan.sourceLocation, language)}</Td>
                <Td>
                  <Badge
                    variant={loan.status === "voided" ? "destructive" : "secondary"}
                  >
                    {t(formatEmployeeLoanStatus(loan.status))}
                  </Badge>
                </Td>
                <Td className="text-end">
                  <BidiValue value={formatCurrency(loan.amount)} />
                </Td>
                <Td className="text-end font-semibold">
                  <BidiValue value={formatCurrency(loan.remainingAmount)} />
                </Td>
                <Td className="text-end">
                  <div className="flex flex-wrap justify-end gap-2">
                    {can("employeeLoans.repay") && loan.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPanel({ type: "repay", loan })}
                      >
                        {t("Record Repayment")}
                      </Button>
                    ) : null}
                    {can("employeeLoans.void") && loan.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setPendingVoidLoan(loan)}
                      >
                        {t("Void")}
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <PaginationControls page={loanPage} t={t} onPageChange={setPage} />

      <SidePanel
        open={Boolean(panel)}
        title={
          panel?.type === "repay" ? t("Record Repayment") : t("New Employee Loan")
        }
        width="md"
        onClose={() => {
          setPanel(null);
          setFormError(null);
        }}
      >
        {panel?.type === "create" ? (
          <EmployeeLoanForm
            employees={employees}
            error={formError}
            isSaving={isSaving}
            onCancel={() => setPanel(null)}
            onSave={handleCreateLoan}
          />
        ) : null}
        {panel?.type === "repay" ? (
          <EmployeeLoanRepaymentForm
            error={formError}
            isSaving={isSaving}
            loan={panel.loan}
            onCancel={() => setPanel(null)}
            onSave={(input) => handleRepayLoan(panel.loan, input)}
          />
        ) : null}
      </SidePanel>

      <LoanVoidDialog
        open={Boolean(pendingVoidLoan)}
        loan={pendingVoidLoan}
        title={t("Void employee loan?")}
        description={t("A loan can only be voided before repayments are recorded.")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Void")}
        isBusy={isSaving}
        onCancel={() => setPendingVoidLoan(null)}
        onConfirm={(reason) => void handleVoidLoan({ reason })}
      />
    </SectionPanel>
  );
}


function LoanVoidDialog({
  cancelLabel,
  confirmLabel,
  description,
  isBusy,
  loan,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  isBusy: boolean;
  loan: EmployeeLoanRecord | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  open: boolean;
  title: string;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open: open && Boolean(loan),
  });

  useEffect(() => {
    if (open) {
      const timeout = window.setTimeout(() => setReason(""), 0);

      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [open]);

  if (!open || !loan) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]">
      <form
        ref={dialogRef}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        data-modal-layer="true"
        role="alertdialog"
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) {
            onConfirm(reason.trim());
          }
        }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {loan.loanNo} - {loan.employeeName}
        </p>
        <Field label="Reason" required>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("Why is this loan being voided?")}
          />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isBusy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant="destructive" disabled={isBusy || !reason.trim()}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}


function EmployeeLoanForm({
  employees,
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  employees: EmployeeLoanEmployeeOption[];
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: EmployeeLoanInput) => Promise<void>;
}) {
  const { language, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<EmployeeLoanFormValues, undefined, EmployeeLoanInput>({
    resolver: zodResolver(employeeLoanFormSchema),
    defaultValues: getDefaultEmployeeLoanFormValues(),
    mode: "onBlur",
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSave)}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <Field label="Employee" required error={errors.employeeUserId?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("employeeUserId")}
        >
          <option value="">{t("Select employee")}</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount" required error={errors.amount?.message}>
        <Input data-ltr="true" inputMode="decimal" placeholder="0" {...register("amount")} />
      </Field>
      <Field label="Loan Date" required error={errors.issuedAt?.message}>
        <Input data-ltr="true" type="datetime-local" {...register("issuedAt")} />
      </Field>
      <Field label="Cash Location" required error={errors.sourceLocation?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("sourceLocation")}
        >
          {moneyLocationValues.map((location) => (
            <option key={location} value={location}>
              {formatMoneyLocation(location, language)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes" error={errors.notes?.message}>
        <Textarea placeholder={t("Optional notes")} {...register("notes")} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Save Loan")}
        </Button>
      </div>
    </form>
  );
}

function EmployeeLoanRepaymentForm({
  error,
  isSaving,
  loan,
  onCancel,
  onSave,
}: {
  error: string | null;
  isSaving: boolean;
  loan: EmployeeLoanRecord;
  onCancel: () => void;
  onSave: (input: EmployeeLoanRepaymentFormInput) => Promise<void>;
}) {
  const { formatCurrency, language, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<
    EmployeeLoanRepaymentFormValues,
    undefined,
    EmployeeLoanRepaymentFormInput
  >({
    resolver: zodResolver(employeeLoanRepaymentFormSchema),
    defaultValues: getDefaultEmployeeLoanRepaymentFormValues(),
    mode: "onBlur",
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSave)}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <DailyItem label={t("Remaining")} value={formatCurrency(loan.remainingAmount)} />
      <Field label="Amount" required error={errors.amount?.message}>
        <Input data-ltr="true" inputMode="decimal" placeholder="0" {...register("amount")} />
      </Field>
      <Field label="Payment Date" required error={errors.paymentDate?.message}>
        <Input data-ltr="true" type="datetime-local" {...register("paymentDate")} />
      </Field>
      <Field label="Cash Location" required error={errors.location?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("location")}
        >
          {moneyLocationValues.map((location) => (
            <option key={location} value={location}>
              {formatMoneyLocation(location, language)}
            </option>
          ))}
        </select>
      </Field>
      <input type="hidden" value="cash" {...register("method")} />
      <Field label="Notes" error={errors.notes?.message}>
        <Textarea placeholder={t("Optional notes")} {...register("notes")} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Save Repayment")}
        </Button>
      </div>
    </form>
  );
}

function formatEmployeeLoanStatus(status: EmployeeLoanRecord["status"]): string {
  if (status === "paid") return "Paid";
  if (status === "voided") return "Voided";

  return "Open";
}
