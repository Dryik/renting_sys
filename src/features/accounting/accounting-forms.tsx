import {
  accountingAdjustmentDirectionValues,
  accountingAdjustmentFormSchema,
  cashMovementFormSchema,
  expenseCategoryValues,
  expenseFormSchema,
  formatAccountingAdjustmentDirection,
  formatCashMovementType,
  formatExpenseCategory,
  formatMoneyLocation,
  getDefaultAccountingAdjustmentFormValues,
  getDefaultCashMovementFormValues,
  getDefaultExpenseFormValues,
  moneyLocationValues,
  type AccountingAdjustmentFormValues,
  type AccountingAdjustmentInput,
  type AccountingDailyClosingRecord,
  type CashMovementFormValues,
  type CashMovementInput,
  type CashMovementType,
  type ExpenseFormValues,
  type ExpenseInput,
  type LocationBalances,
} from "@/shared/accounting";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Loader2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { VehicleRecord } from "@/shared/vehicles";
import { rentalAppApi } from "@/data/rental-app-api";
import { useForm, useWatch } from "react-hook-form";
import { useI18n } from "@/hooks/useI18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatExpenseMethodLabel, parseMoney, selectClassName, transferPresets } from "./accounting-shared";
import { DailyItem } from "./accounting-tables";

/**
 * The owner accounting forms. Each collects input and calls back; the page
 * owns every mutation they trigger.
 */
export function ExpenseForm({
  balances,
  error,
  formatCurrency,
  isSaving,
  language,
  onCancel,
  onSave,
  vehicles,
}: {
  balances: LocationBalances;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  language: "ar" | "en";
  onCancel: () => void;
  onSave: (input: ExpenseInput) => Promise<void>;
  vehicles: VehicleRecord[];
}) {
  const { t } = useI18n();
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ExpenseFormValues, unknown, ExpenseInput>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: getDefaultExpenseFormValues(),
    mode: "onBlur",
  });
  const location = useWatch({ control, name: "location" }) ?? "cash_drawer";
  const amountValue = useWatch({ control, name: "amount" });
  const available = balances[location];
  const amount = parseMoney(amountValue);

  async function submit(values: ExpenseInput) {
    setLocalError(null);

    if (values.amount > balances[values.location]) {
      setLocalError(t("Amount is more than the available balance."));
      return;
    }

    await onSave(values);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit((values) => void submit(values))}>
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <BalanceHint
        amount={amount}
        available={available}
        formatCurrency={formatCurrency}
        t={t}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Category" required error={errors.category?.message}>
          <select className={selectClassName} {...register("category")}>
            {expenseCategoryValues.map((category) => (
              <option key={category} value={category}>
                {formatExpenseCategory(category, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paid From" required error={errors.location?.message}>
          <select className={selectClassName} {...register("location")}>
            {moneyLocationValues.map((moneyLocation) => (
              <option key={moneyLocation} value={moneyLocation}>
                {formatMoneyLocation(moneyLocation, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Method">
          <Input
            disabled
            value={t(formatExpenseMethodLabel(location))}
            readOnly
          />
        </Field>
        <Field label="Amount" required error={errors.amount?.message}>
          <Input data-ltr="true" inputMode="decimal" placeholder="0.00" {...register("amount")} />
        </Field>
        <Field label="Expense Date" required error={errors.expenseDate?.message}>
          <Input data-ltr="true" type="datetime-local" {...register("expenseDate")} />
        </Field>
        <Field label="Vendor" error={errors.vendorName?.message}>
          <Input placeholder={t("Optional")} {...register("vendorName")} />
        </Field>
        <Field label="Vehicle" error={errors.vehicleId?.message}>
          <select className={selectClassName} {...register("vehicleId")}>
            <option value="">{t("Not linked")}</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber} - {vehicle.brand} {vehicle.model}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2 lg:col-span-3">
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </div>
      </div>

      <FormActions
        cancelLabel={t("Cancel")}
        isSaving={isSaving}
        saveLabel={t("Record Expense")}
        onCancel={onCancel}
      />
    </form>
  );
}

export function CashMovementForm({
  balances,
  error,
  formatCurrency,
  isSaving,
  language,
  movementType,
  onCancel,
  onSave,
  ownerPinRequired,
}: {
  balances: LocationBalances;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  language: "ar" | "en";
  movementType: CashMovementType;
  onCancel: () => void;
  onSave: (input: CashMovementInput, approvalToken?: string) => Promise<void>;
  ownerPinRequired: boolean;
}) {
  const { t } = useI18n();
  const [ownerPin, setOwnerPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setValue,
  } = useForm<CashMovementFormValues, unknown, CashMovementInput>({
    resolver: zodResolver(cashMovementFormSchema),
    defaultValues: getDefaultCashMovementFormValues(movementType),
    mode: "onBlur",
  });
  const fromLocation = useWatch({ control, name: "fromLocation" }) ?? "cash_drawer";
  const amountValue = useWatch({ control, name: "amount" });
  const available = balances[fromLocation];
  const amount = parseMoney(amountValue);

  async function submit(input: CashMovementInput) {
    setLocalError(null);
    let approvalToken: string | undefined;

    if (input.amount > balances[input.fromLocation]) {
      setLocalError(t("Amount is more than the available balance."));
      return;
    }

    if (input.type === "owner_withdrawal" && ownerPinRequired) {
      if (!/^\d{4}$/.test(ownerPin)) {
        setLocalError(t("PIN must be exactly 4 digits."));
        return;
      }

      const approval = await rentalAppApi.security.approveSensitiveAction({
        action: "cashMovements.ownerWithdrawal",
        pin: ownerPin,
      });
      approvalToken = approval.token;
    }

    await onSave(input, approvalToken);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit((values) => void submit(values))}>
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <input type="hidden" value={movementType} {...register("type")} />

      {movementType === "transfer" ? (
        <div className="flex flex-wrap gap-2">
          {transferPresets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setValue("fromLocation", preset.from, { shouldValidate: true });
                setValue("toLocation", preset.to, { shouldValidate: true });
              }}
            >
              {t(preset.label)}
            </Button>
          ))}
        </div>
      ) : null}

      <BalanceHint
        amount={amount}
        available={available}
        formatCurrency={formatCurrency}
        t={t}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="From" required error={errors.fromLocation?.message}>
          <select className={selectClassName} {...register("fromLocation")}>
            {moneyLocationValues.map((location) => (
              <option key={location} value={location}>
                {formatMoneyLocation(location, language)}
              </option>
            ))}
          </select>
        </Field>
        {movementType === "transfer" ? (
          <Field label="To" required error={errors.toLocation?.message}>
            <select className={selectClassName} {...register("toLocation")}>
              <option value="">{t("Select destination")}</option>
              {moneyLocationValues
                .filter((location) => location !== fromLocation)
                .map((location) => (
                  <option key={location} value={location}>
                    {formatMoneyLocation(location, language)}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        <Field label="Amount" required error={errors.amount?.message}>
          <Input data-ltr="true" inputMode="decimal" placeholder="0.00" {...register("amount")} />
        </Field>
        <Field label="Date & Time" required error={errors.movementDate?.message}>
          <Input data-ltr="true" type="datetime-local" {...register("movementDate")} />
        </Field>
        {movementType === "owner_withdrawal" && ownerPinRequired ? (
          <Field label="Owner PIN" required>
            <Input
              autoComplete="current-password"
              data-ltr="true"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              type="password"
              value={ownerPin}
              onChange={(event) =>
                setOwnerPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </Field>
        ) : null}
        <div className="md:col-span-2 lg:col-span-3">
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </div>
      </div>

      <FormActions
        cancelLabel={t("Cancel")}
        isSaving={isSaving}
        saveLabel={formatCashMovementType(movementType, language)}
        onCancel={onCancel}
      />
    </form>
  );
}

export function AdjustmentForm({
  balances,
  error,
  formatCurrency,
  isSaving,
  language,
  onCancel,
  onSave,
  ownerPinRequired,
}: {
  balances: LocationBalances;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  language: "ar" | "en";
  onCancel: () => void;
  onSave: (input: AccountingAdjustmentInput, approvalToken?: string) => Promise<void>;
  ownerPinRequired: boolean;
}) {
  const { t } = useI18n();
  const [ownerPin, setOwnerPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<AccountingAdjustmentFormValues, unknown, AccountingAdjustmentInput>({
    resolver: zodResolver(accountingAdjustmentFormSchema),
    defaultValues: getDefaultAccountingAdjustmentFormValues(),
    mode: "onBlur",
  });
  const location = useWatch({ control, name: "location" }) ?? "cash_drawer";
  const direction = useWatch({ control, name: "direction" }) ?? "increase";
  const amountValue = useWatch({ control, name: "amount" });
  const available = balances[location];
  const amount = parseMoney(amountValue);

  async function submit(input: AccountingAdjustmentInput) {
    setLocalError(null);
    let approvalToken: string | undefined;

    if (input.direction === "decrease" && input.amount > balances[input.location]) {
      setLocalError(t("Amount is more than the available balance."));
      return;
    }

    if (ownerPinRequired) {
      if (!/^\d{4}$/.test(ownerPin)) {
        setLocalError(t("PIN must be exactly 4 digits."));
        return;
      }

      const approval = await rentalAppApi.security.approveSensitiveAction({
        action: "accountingAdjustments.create",
        pin: ownerPin,
      });
      approvalToken = approval.token;
    }

    await onSave(input, approvalToken);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit((values) => void submit(values))}>
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <BalanceHint
        amount={direction === "decrease" ? amount : 0}
        available={available}
        formatCurrency={formatCurrency}
        t={t}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Location" required error={errors.location?.message}>
          <select className={selectClassName} {...register("location")}>
            {moneyLocationValues.map((moneyLocation) => (
              <option key={moneyLocation} value={moneyLocation}>
                {formatMoneyLocation(moneyLocation, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Direction" required error={errors.direction?.message}>
          <select className={selectClassName} {...register("direction")}>
            {accountingAdjustmentDirectionValues.map((value) => (
              <option key={value} value={value}>
                {formatAccountingAdjustmentDirection(value, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount" required error={errors.amount?.message}>
          <Input data-ltr="true" inputMode="decimal" placeholder="0.00" {...register("amount")} />
        </Field>
        <Field label="Adjustment Date" required error={errors.adjustmentDate?.message}>
          <Input data-ltr="true" type="datetime-local" {...register("adjustmentDate")} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Reason" required error={errors.reason?.message}>
            <Input {...register("reason")} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </div>
        {ownerPinRequired ? (
          <Field label="Owner PIN" required>
            <Input
              autoComplete="current-password"
              data-ltr="true"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              type="password"
              value={ownerPin}
              onChange={(event) =>
                setOwnerPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </Field>
        ) : null}
      </div>

      <FormActions
        cancelLabel={t("Cancel")}
        isSaving={isSaving}
        saveLabel={t("Save Adjustment")}
        onCancel={onCancel}
      />
    </form>
  );
}

export function BalanceHint({
  amount,
  available,
  formatCurrency,
  t,
}: {
  amount: number;
  available: number;
  formatCurrency: (value: number) => string;
  t: (key: string) => string;
}) {
  const remaining = available - amount;
  const overdrawn = amount > available;

  return (
    <div
      className={
        overdrawn
          ? "rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          : "rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm"
      }
    >
      <div className="flex flex-wrap justify-between gap-3">
        <span>{t("Available Balance")}</span>
        <strong>
          <BidiValue value={formatCurrency(available)} />
        </strong>
      </div>
      {amount > 0 ? (
        <div className="mt-1 flex flex-wrap justify-between gap-3 text-muted-foreground">
          <span>{t("After Save")}</span>
          <strong className={overdrawn ? "text-destructive" : "text-foreground"}>
            <BidiValue value={formatCurrency(remaining)} />
          </strong>
        </div>
      ) : null}
      {overdrawn ? (
        <p className="mt-2 font-medium">
          {t("Amount is more than the available balance.")}
        </p>
      ) : null}
    </div>
  );
}

export function DailyClosingForm({
  closing,
  error,
  formatCurrency,
  isSaving,
  onCancel,
  onSave,
}: {
  closing: AccountingDailyClosingRecord | null;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: {
    countedCash: number;
    notes: string | null;
    reason?: string;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const expectedCash = closing?.expectedCash ?? 0;
  const [countedCash, setCountedCash] = useState(
    closing?.countedCash === null || closing?.countedCash === undefined
      ? ""
      : String(closing.countedCash),
  );
  const [notes, setNotes] = useState(closing?.notes ?? "");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const parsedCountedCash = Number(countedCash);
  const difference =
    countedCash && Number.isFinite(parsedCountedCash)
      ? parsedCountedCash - expectedCash
      : null;

  async function submit() {
    setLocalError(null);

    if (!Number.isFinite(parsedCountedCash) || parsedCountedCash < 0) {
      setLocalError(t("Counted cash must be zero or more."));
      return;
    }

    if (closing?.isClosed && reason.trim().length === 0) {
      setLocalError(t("Reason is required when closing this day again."));
      return;
    }

    await onSave({
      countedCash: parsedCountedCash,
      notes: notes.trim() || null,
      reason: reason.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <DailyItem label={t("Expected Cash")} value={formatCurrency(expectedCash)} />
        <DailyItem
          label={t("Counted Cash")}
          value={countedCash ? formatCurrency(parsedCountedCash) : t("Not available")}
        />
        <div
          className={
            difference === null
              ? "rounded-xl border border-border/70 bg-background px-4 py-3"
              : difference === 0
                ? "rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-success"
                : "rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-warning"
          }
        >
          <p className="text-xs font-medium text-muted-foreground">{t("Difference")}</p>
          <div className="mt-2 font-bold">
            {difference === null ? t("Not available") : formatCurrency(difference)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Counted Cash" required>
          <div className="flex gap-2">
            <Input
              data-ltr="true"
              inputMode="decimal"
              value={countedCash}
              onChange={(event) => setCountedCash(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setCountedCash(String(expectedCash))}
            >
              {t("Use Expected Cash")}
            </Button>
          </div>
        </Field>
        {closing?.isClosed ? (
          <Field label="Reason" required>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        ) : null}
        <div className="md:col-span-2">
          <Field label="Notes">
            <Textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          disabled={isSaving}
          onClick={() => {
            if (closing?.isClosed) {
              setConfirmOpen(true);
            } else {
              void submit();
            }
          }}
        >
          {isSaving ? <Loader2 data-icon="inline-start" /> : null}
          {closing?.isClosed ? t("Close Day Again") : t("Close Day")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("Close day again?")}
        description={t("This will replace the saved daily closing for this date.")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Close Day Again")}
        isBusy={isSaving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void submit();
        }}
      />
    </div>
  );
}

export function FormActions({
  cancelLabel,
  isSaving,
  onCancel,
  saveLabel,
}: {
  cancelLabel: string;
  isSaving: boolean;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="flex justify-end gap-3 border-t pt-4">
      <Button type="button" variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? <Loader2 data-icon="inline-start" /> : null}
        {saveLabel}
      </Button>
    </div>
  );
}

type FieldProps = {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
};

export function Field({ children, error, label, required = false }: FieldProps) {
  const { t } = useI18n();

  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {t(label)}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? <span className="text-xs font-normal text-destructive">{t(error)}</span> : null}
    </label>
  );
}
