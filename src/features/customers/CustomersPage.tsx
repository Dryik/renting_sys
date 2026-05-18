import { Edit, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerInput, CustomerRecord } from "@/shared/customers";
import { CustomerForm } from "./CustomerForm";

type FormState =
  | {
      mode: "create";
      customer: null;
    }
  | {
      mode: "edit";
      customer: CustomerRecord;
    }
  | null;

export function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);

  const loadCustomers = useCallback(async (searchValue: string) => {
    setIsLoading(true);
    setListError(null);

    try {
      const records = await window.rentalApp.customers.list(searchValue);
      setCustomers(records);
    } catch (error) {
      setListError(getErrorMessage(error, "Customers could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCustomers(search);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadCustomers, search]);

  const summary = useMemo(() => {
    return customers.reduce(
      (values, customer) => {
        values.total += 1;

        if (customer.driverLicenseNo) {
          values.withLicense += 1;
        }

        if (customer.nationalId) {
          values.withId += 1;
        }

        return values;
      },
      {
        total: 0,
        withLicense: 0,
        withId: 0,
      },
    );
  }, [customers]);

  async function handleSave(input: CustomerInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      if (formState?.mode === "edit") {
        await window.rentalApp.customers.update(formState.customer.id, input);
      } else {
        await window.rentalApp.customers.create(input);
      }

      setFormState(null);
      await loadCustomers(search);
    } catch (error) {
      setFormError(getErrorMessage(error, "Customer could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to deactivate this customer? They will be removed from the active list.",
    );

    if (!confirmed) return;

    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.customers.deactivate(id);
      setFormState(null);
      await loadCustomers(search);
    } catch (error) {
      setFormError(getErrorMessage(error, "Customer could not be deactivated."));
    } finally {
      setIsSaving(false);
    }
  }

  function openCreateForm() {
    setFormError(null);
    setFormState({ mode: "create", customer: null });
  }

  function openEditForm(customer: CustomerRecord) {
    setFormError(null);
    setFormState({ mode: "edit", customer });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search name, phone, ID, or license"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Button onClick={openCreateForm}>
          <Plus data-icon="inline-start" />
          Add Customer
        </Button>
      </div>

      {formState ? (
        <CustomerForm
          customer={formState.customer}
          error={formError}
          isSaving={isSaving}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
          onDeactivate={
            formState.mode === "edit"
              ? () => handleDeactivate(formState.customer.id)
              : undefined
          }
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryBadge label="Total" value={summary.total} />
        <SummaryBadge label="With License" value={summary.withLicense} />
        <SummaryBadge label="With ID / Passport" value={summary.withId} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>
                Search by name, phone, ID number, or driver license.
              </CardDescription>
            </div>
            <Badge variant="secondary">{customers.length} shown</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {listError ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {listError}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <Th>Customer</Th>
                  <Th>Phone</Th>
                  <Th>ID / Passport</Th>
                  <Th>Driver License</Th>
                  <Th>Address</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <EmptyRow message="Loading customers..." />
                ) : customers.length === 0 ? (
                  <EmptyRow
                    message={
                      search.trim()
                        ? "No customers match this search."
                        : "No customers yet. Use Add Customer to create the first one."
                    }
                  />
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} className="border-t">
                      <Td>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold">{customer.fullName}</span>
                          <span className="text-xs text-muted-foreground">
                            Added {formatDate(customer.createdAt)}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-1">
                          <span>{customer.phone}</span>
                          <span className="text-xs text-muted-foreground">
                            Second: {customer.secondaryPhone ?? "No second phone"}
                          </span>
                        </div>
                      </Td>
                      <Td>{customer.nationalId ?? "No ID"}</Td>
                      <Td>
                        <div className="flex flex-col gap-1">
                          <span>{customer.driverLicenseNo ?? "No license"}</span>
                          <span className="text-xs text-muted-foreground">
                            Expiry: {customer.licenseExpiryDate ?? "No date"}
                          </span>
                        </div>
                      </Td>
                      <Td>{customer.address ?? "No address"}</Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditForm(customer)}
                        >
                          <Edit data-icon="inline-start" />
                          Edit
                        </Button>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={cn("px-4 py-3 font-medium", className)}>{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function EmptyRow({ message }: { message: string }) {
  return (
    <tr>
      <td className="px-4 py-12 text-center text-muted-foreground" colSpan={6}>
        {message}
      </td>
    </tr>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
