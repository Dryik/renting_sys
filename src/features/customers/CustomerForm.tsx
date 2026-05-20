import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import {
  customerFormSchema,
  customerToFormValues,
  emptyCustomerFormValues,
  type CustomerFormValues,
  type CustomerInput,
  type CustomerRecord,
} from "@/shared/customers";

type CustomerFormProps = {
  customer: CustomerRecord | null;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: CustomerInput) => Promise<void>;
  onDeactivate?: () => void;
};

export function CustomerForm({
  customer,
  error,
  isSaving,
  onCancel,
  onSave,
  onDeactivate,
}: CustomerFormProps) {
  const { t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<CustomerFormValues, undefined, CustomerInput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: customer
      ? customerToFormValues(customer)
      : emptyCustomerFormValues,
    mode: "onBlur",
  });

  useEffect(() => {
    reset(customer ? customerToFormValues(customer) : emptyCustomerFormValues);
  }, [customer, reset]);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => onSave(values))}
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field label="Customer Name" required error={errors.fullName?.message}>
          <Input
            aria-invalid={Boolean(errors.fullName)}
            placeholder={t("Full name")}
            {...register("fullName")}
          />
        </Field>

        <Field label="Phone" required error={errors.phone?.message}>
          <Input
            aria-invalid={Boolean(errors.phone)}
            data-ltr="true"
            placeholder={t("Phone number")}
            {...register("phone")}
          />
        </Field>

        <Field label="Second Phone" error={errors.secondaryPhone?.message}>
          <Input data-ltr="true" placeholder={t("Optional")} {...register("secondaryPhone")} />
        </Field>

        <Field label="National ID / Passport" error={errors.nationalId?.message}>
          <Input data-ltr="true" placeholder={t("ID or passport number")} {...register("nationalId")} />
        </Field>

        <Field
          label="Driver License Number"
          error={errors.driverLicenseNo?.message}
        >
          <Input data-ltr="true" placeholder={t("License number")} {...register("driverLicenseNo")} />
        </Field>

        <Field
          label="License Expiry"
          error={errors.licenseExpiryDate?.message}
        >
          <Input data-ltr="true" type="date" {...register("licenseExpiryDate")} />
        </Field>

        <div className="md:col-span-2">
          <Field label="Address" error={errors.address?.message}>
            <Input placeholder={t("Optional address")} {...register("address")} />
          </Field>
        </div>
      </div>

      <div>
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea placeholder={t("Optional customer notes")} {...register("notes")} />
        </Field>
      </div>

      <div className="flex justify-between border-t pt-4">
        <div>
          {customer && onDeactivate ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onDeactivate}
              disabled={isSaving}
            >
              {t("Deactivate")}
            </Button>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 data-icon="inline-start" /> : null}
            {customer ? t("Save Changes") : t("Save Customer")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  children,
  error,
  label,
  required = false,
}: {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
}) {
  const { t } = useI18n();

  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {t(label)}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-sm font-normal text-destructive">{t(error)}</span>
      ) : null}
    </label>
  );
}
