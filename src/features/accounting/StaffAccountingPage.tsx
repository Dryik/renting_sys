import {
  Banknote,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import {
  expenseCategoryValues,
  expenseFormSchema,
  formatExpenseCategory,
  getDefaultExpenseFormValues,
  getExpensePaymentMethodForLocation,
  type ExpenseFormValues,
  type ExpenseInput,
  type StaffDailyClosingRecord,
  type WeeklyIncomeDayRecord,
} from "@/shared/accounting";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { rentalAppApi } from "@/data/rental-app-api";
import { useAuth } from "@/hooks/useAuth";
import {
  useBusinessMutation,
  useBusinessQuery,
} from "@/data/hooks";
import { useForm } from "react-hook-form";
import { useI18n } from "@/hooks/useI18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "./accounting-forms";
import { getErrorMessage, rowClassName, toDateInputValue } from "./accounting-shared";
import { CompactMetric, DailyItem } from "./accounting-tables";

/**
 * What a staff member without `accounting.view` sees: this week's income,
 * a cash expense form and the daily close. Owns its own queries.
 */
export function StaffAccountingPage() {
  const { can } = useAuth();
  const { formatCurrency, t } = useI18n();
  const today = toDateInputValue(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [closing, setClosing] = useState<StaffDailyClosingRecord | null>(null);
  const [panel, setPanel] = useState<"expense" | "close" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const weeklyIncomeQuery = useBusinessQuery<WeeklyIncomeDayRecord[]>(
    "accounting",
    "weeklyIncome",
    selectedDate,
    () => rentalAppApi.accounting.getWeeklyIncome(selectedDate),
  );
  const weeklyIncome = weeklyIncomeQuery.data ?? [];
  const isLoading = weeklyIncomeQuery.isPending;
  const isRefreshing = weeklyIncomeQuery.isFetching;
  const error = weeklyIncomeQuery.isError
    ? getErrorMessage(weeklyIncomeQuery.error, t("Weekly income could not be loaded."))
    : null;

  const createStaffExpense = useBusinessMutation((input: ExpenseInput) =>
    rentalAppApi.accounting.createExpense(input),
  );
  const saveStaffClosing = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.accounting.saveStaffDailyClosing>[0]) =>
      rentalAppApi.accounting.saveStaffDailyClosing(input),
  );

  async function handleStaffExpense(input: ExpenseInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await createStaffExpense.mutateAsync({
        ...input,
        location: "cash_drawer",
        method: getExpensePaymentMethodForLocation("cash_drawer"),
      });
      setPanel(null);
    } catch (err) {
      setFormError(getErrorMessage(err, t("Expense could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStaffClose(input: {
    countedCash: number;
    notes: string | null;
  }) {
    setIsSaving(true);
    setFormError(null);

    try {
      const saved = await saveStaffClosing.mutateAsync({
        closingDate: selectedDate,
        ...input,
      });
      setClosing(saved);
      setPanel(null);
    } catch (err) {
      setFormError(getErrorMessage(err, t("Daily closing could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  const netTotal = weeklyIncome.reduce((total, day) => total + day.netIncome, 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>{t("Week Ending")}</span>
            <Input
              className="w-40"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || today)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isRefreshing}
              onClick={() => void weeklyIncomeQuery.refetch()}
            >
              <RefreshCw
                className={isRefreshing ? "animate-spin" : undefined}
                data-icon="inline-start"
              />
              {t("Refresh")}
            </Button>
            {can("expenses.create") ? (
              <Button type="button" onClick={() => setPanel("expense")}>
                <Plus data-icon="inline-start" />
                {t("Record Expense")}
              </Button>
            ) : null}
            {can("dailyClosing.staffClose") ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPanel("close")}
              >
                <Banknote data-icon="inline-start" />
                {t("Close Day")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CompactMetric
            label={t("Weekly Income")}
            value={formatCurrency(netTotal)}
            tone="good"
          />
          <DailyItem
            label={t("Daily Close")}
            value={
              closing
                ? t("Saved")
                : t("Enter counted cash without viewing expected balance.")
            }
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      <SectionPanel
        title={t("Weekly Income")}
        description={t("Posted rental payments for the last 7 days. Refunds are shown as negative amounts.")}
      >
        <DataTable className="min-w-[720px]" containerClassName="min-h-[18rem]">
          <thead className="bg-muted/70 text-muted-foreground">
            <tr>
              <Th>{t("Date")}</Th>
              <Th className="text-end">{t("Rent")}</Th>
              <Th className="text-end">{t("Deposit")}</Th>
              <Th className="text-end">{t("Extra Charges")}</Th>
              <Th className="text-end">{t("Refunds")}</Th>
              <Th className="text-end">{t("Net")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={6} message={t("Loading income...")} state="loading" />
            ) : weeklyIncome.length === 0 ? (
              <EmptyTableRow colSpan={6} message={t("No income found.")} />
            ) : (
              weeklyIncome.map((day) => (
                <tr key={day.date} className={rowClassName}>
                  <Td className="tabular-nums">{day.date}</Td>
                  <Td className="text-end"><BidiValue value={formatCurrency(day.rent)} /></Td>
                  <Td className="text-end"><BidiValue value={formatCurrency(day.deposit)} /></Td>
                  <Td className="text-end"><BidiValue value={formatCurrency(day.extraCharge)} /></Td>
                  <Td className="text-end text-warning"><BidiValue value={formatCurrency(day.refunds)} /></Td>
                  <Td className="text-end font-semibold"><BidiValue value={formatCurrency(day.netIncome)} /></Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      </SectionPanel>

      <SidePanel
        open={Boolean(panel)}
        title={panel === "close" ? t("Close Day") : t("Record Expense")}
        width="md"
        onClose={() => {
          setPanel(null);
          setFormError(null);
        }}
      >
        {panel === "expense" ? (
          <StaffExpenseForm
            error={formError}
            isSaving={isSaving}
            onCancel={() => setPanel(null)}
            onSave={handleStaffExpense}
          />
        ) : null}
        {panel === "close" ? (
          <StaffDailyCloseForm
            error={formError}
            isSaving={isSaving}
            onCancel={() => setPanel(null)}
            onSave={handleStaffClose}
          />
        ) : null}
      </SidePanel>
    </div>
  );
}


function StaffExpenseForm({
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: ExpenseInput) => Promise<void>;
}) {
  const { language, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ExpenseFormValues, undefined, ExpenseInput>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      ...getDefaultExpenseFormValues(),
      location: "cash_drawer",
      vehicleId: "",
    },
    mode: "onBlur",
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSave)}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <Field label="Category" required error={errors.category?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("category")}
        >
          {expenseCategoryValues.map((category) => (
            <option key={category} value={category}>
              {formatExpenseCategory(category, language)}
            </option>
          ))}
        </select>
      </Field>
      <input type="hidden" value="cash_drawer" {...register("location")} />
      <input type="hidden" value="" {...register("vehicleId")} />
      <Field label="Amount" required error={errors.amount?.message}>
        <Input data-ltr="true" inputMode="decimal" placeholder="0" {...register("amount")} />
      </Field>
      <Field label="Date" required error={errors.expenseDate?.message}>
        <Input data-ltr="true" type="datetime-local" {...register("expenseDate")} />
      </Field>
      <Field label="Vendor" error={errors.vendorName?.message}>
        <Input placeholder={t("Optional vendor name")} {...register("vendorName")} />
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
          {t("Save Expense")}
        </Button>
      </div>
    </form>
  );
}

function StaffDailyCloseForm({
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: { countedCash: number; notes: string | null }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(countedCash);

    if (!Number.isFinite(amount) || amount < 0) {
      return;
    }

    void onSave({
      countedCash: amount,
      notes: notes.trim() || null,
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmitForm}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <Field label="Counted Cash" required>
        <Input
          data-ltr="true"
          inputMode="decimal"
          placeholder="0"
          value={countedCash}
          onChange={(event) => setCountedCash(event.target.value)}
        />
      </Field>
      <Field label="Notes">
        <Textarea
          placeholder={t("Optional closing notes")}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <div className="rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
        {t("Expected cash and differences are hidden for staff.")}
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Save Close")}
        </Button>
      </div>
    </form>
  );
}
