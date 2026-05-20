import { Edit, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SidePanel } from "@/components/ui/side-panel";
import { useI18n } from "@/hooks/useI18n";
import type { CustomerInput, CustomerRecord } from "@/shared/customers";
import type { PageResult } from "@/shared/pagination";
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

const emptyCustomerPage: PageResult<CustomerRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export function CustomersPage() {
  const { formatDate, t } = useI18n();
  const [customerPage, setCustomerPage] = useState(emptyCustomerPage);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [customerToDeactivate, setCustomerToDeactivate] = useState<CustomerRecord | null>(null);

  const loadCustomers = useCallback(async (nextPage = page) => {
    setIsLoading(true);
    setListError(null);

    try {
      const result = await window.rentalApp.customers.list({
        page: nextPage,
        search,
      });
      setCustomerPage(result);
    } catch (error) {
      setListError(getErrorMessage(error, t("Customers could not be loaded.")));
    } finally {
      setIsLoading(false);
    }
  }, [page, search, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCustomers(page);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadCustomers, page]);

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
      await loadCustomers(page);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Customer could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(id: number) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.customers.deactivate(id);
      setFormState(null);
      await loadCustomers(page);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Customer could not be deactivated.")));
    } finally {
      setIsSaving(false);
      setCustomerToDeactivate(null);
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
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-10"
            placeholder={t("Search name, phone, ID, or license")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <Button onClick={openCreateForm}>
          <Plus data-icon="inline-start" />
          {t("Add Customer")}
        </Button>
      </div>

      <SidePanel
        open={Boolean(formState)}
        title={formState?.mode === "edit" ? t("Edit Customer") : t("Add Customer")}
        description={t("Customer form description")}
        width="lg"
        onClose={() => setFormState(null)}
      >
        <CustomerForm
          customer={formState?.customer ?? null}
          error={formError}
          isSaving={isSaving}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
          onDeactivate={
            formState?.mode === "edit"
              ? () => setCustomerToDeactivate(formState.customer)
              : undefined
          }
        />
      </SidePanel>

      <section className="rounded-md border bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{t("Customer List")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Search by name, phone, ID number, or driver license.")}
            </p>
          </div>
          <Badge variant="secondary">{t("{{count}} shown", { count: customerPage.total })}</Badge>
        </div>
        {listError ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {listError}
          </div>
        ) : null}

        <DataTable className="min-w-[760px]">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <Th>{t("Customer")}</Th>
              <Th>{t("Phone")}</Th>
              <Th>{t("ID / Passport")}</Th>
              <Th>{t("Driver License")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={5} message={t("Loading customers...")} />
            ) : customerPage.rows.length === 0 ? (
              <EmptyTableRow
                colSpan={5}
                message={
                  search.trim()
                    ? t("No customers match this search.")
                    : t("No customers yet. Use Add Customer to create the first one.")
                }
              />
            ) : (
              customerPage.rows.map((customer) => (
                <tr key={customer.id} className="border-t hover:bg-muted/25">
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">{customer.fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("Added")} <BidiValue value={formatDate(customer.createdAt)} />
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <BidiValue value={customer.phone} />
                      {customer.secondaryPhone ? (
                        <BidiValue className="text-xs text-muted-foreground" value={customer.secondaryPhone} />
                      ) : null}
                    </div>
                  </Td>
                  <Td>{customer.nationalId ? <BidiValue value={customer.nationalId} /> : t("No ID")}</Td>
                  <Td>{customer.driverLicenseNo ? <BidiValue value={customer.driverLicenseNo} /> : t("No license")}</Td>
                  <Td className="text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditForm(customer)}
                    >
                      <Edit data-icon="inline-start" />
                      {t("Edit")}
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <PaginationControls page={customerPage} t={t} onPageChange={setPage} />
      </section>

      <ConfirmDialog
        open={Boolean(customerToDeactivate)}
        title={t("Deactivate customer?")}
        description={t("Deactivate customer confirmation")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Deactivate")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setCustomerToDeactivate(null)}
        onConfirm={() => {
          if (customerToDeactivate) {
            void handleDeactivate(customerToDeactivate.id);
          }
        }}
      />
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
