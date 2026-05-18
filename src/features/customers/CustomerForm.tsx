import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
      className="rounded-lg border bg-card p-5 shadow-sm"
      onSubmit={handleSubmit((values) => onSave(values))}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h4 className="text-lg font-semibold">
            {customer ? "Edit Customer" : "Add Customer"}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Store the details staff need to identify the renter quickly.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field label="Customer Name" required error={errors.fullName?.message}>
          <Input
            aria-invalid={Boolean(errors.fullName)}
            placeholder="Full name"
            {...register("fullName")}
          />
        </Field>

        <Field label="Phone" required error={errors.phone?.message}>
          <Input
            aria-invalid={Boolean(errors.phone)}
            placeholder="Phone number"
            {...register("phone")}
          />
        </Field>

        <Field label="Second Phone" error={errors.secondaryPhone?.message}>
          <Input placeholder="Optional" {...register("secondaryPhone")} />
        </Field>

        <Field label="National ID / Passport" error={errors.nationalId?.message}>
          <Input placeholder="ID or passport number" {...register("nationalId")} />
        </Field>

        <Field
          label="Driver License Number"
          error={errors.driverLicenseNo?.message}
        >
          <Input placeholder="License number" {...register("driverLicenseNo")} />
        </Field>

        <Field
          label="License Expiry"
          error={errors.licenseExpiryDate?.message}
        >
          <Input type="date" {...register("licenseExpiryDate")} />
        </Field>

        <div className="md:col-span-2">
          <Field label="Address" error={errors.address?.message}>
            <Input placeholder="Optional address" {...register("address")} />
          </Field>
        </div>
      </div>

      <div className="mt-4">
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea placeholder="Optional customer notes" {...register("notes")} />
        </Field>
      </div>

      <div className="mt-5 flex justify-between border-t pt-4">
        <div>
          {customer && onDeactivate ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onDeactivate}
              disabled={isSaving}
            >
              Deactivate
            </Button>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 data-icon="inline-start" /> : null}
            {customer ? "Save Changes" : "Save Customer"}
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
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-sm font-normal text-destructive">{error}</span>
      ) : null}
    </label>
  );
}
