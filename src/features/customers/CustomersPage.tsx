import { Eye, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { CustomerPhotoAvatar } from "@/components/ui/customer-photo-avatar";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/ui/search-input";
import { SectionPanel } from "@/components/ui/section-panel";
import { SidePanel } from "@/components/ui/side-panel";
import { DocumentPhotoSection } from "@/components/ui/document-photo-section";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import type { CustomerInput, CustomerRecord } from "@/shared/customers";
import type { PageResult } from "@/shared/pagination";
import { CustomerForm } from "./CustomerForm";
import { CustomerDetailsPanel } from "./CustomerDetailsPanel";

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

const rowClassName =
  "group transition-colors hover:bg-muted/35 focus-within:bg-muted/40";

export function CustomersPage() {
  const { can } = useAuth();
  const { formatDate, t } = useI18n();
  const [customerPage, setCustomerPage] = useState(emptyCustomerPage);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [detailsCustomer, setDetailsCustomer] = useState<CustomerRecord | null>(null);
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
        setFormState(null);
      } else {
        const createdCustomer = await window.rentalApp.customers.create(input);
        setFormState({ mode: "edit", customer: createdCustomer });
      }

      await loadCustomers(page);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Customer could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(id: number, reason: string) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.customers.deactivate({ customerId: id, reason });
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

  function openDetails(customer: CustomerRecord) {
    setDetailsCustomer(customer);
  }

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        actions={can("customers.create") ? (
          <Button className="w-full sm:w-auto" size="lg" onClick={openCreateForm}>
            <Plus data-icon="inline-start" />
            {t("Add Customer")}
          </Button>
        ) : null}
      >
        <SearchInput
          placeholder={t("Search name, phone, ID, or license")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </ListToolbar>

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
            formState?.mode === "edit" && can("customers.deactivate")
              ? () => setCustomerToDeactivate(formState.customer)
              : undefined
          }
        />
        {formState ? (
          formState.mode === "edit" ? (
            <DocumentPhotoSection entityType="customer" entityId={formState.customer.id} />
          ) : (
            <div className="mt-5 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {t("Save the customer first, then add documents and photos here.")}
            </div>
          )
        ) : null}
      </SidePanel>

      <SidePanel
        open={Boolean(detailsCustomer)}
        title={t("Customer Details")}
        description={t("Customer identity and contact details.")}
        width="lg"
        onClose={() => setDetailsCustomer(null)}
      >
        {detailsCustomer ? (
          <CustomerDetailsPanel
            customer={detailsCustomer}
            onEdit={can("customers.edit") ? () => {
              const customer = detailsCustomer;
              setDetailsCustomer(null);
              openEditForm(customer);
            } : undefined}
          />
        ) : null}
      </SidePanel>

      <SectionPanel className="overflow-hidden p-0">
        {listError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(listError)}
          </div>
        ) : null}

        <DataTable className="min-w-[760px]" containerClassName="rounded-none border-0 shadow-none">
          <thead className="bg-muted/70 text-muted-foreground">
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
              <EmptyTableRow colSpan={5} message={t("Loading customers...")} state="loading" />
            ) : customerPage.rows.length === 0 ? (
              <EmptyTableRow
                colSpan={5}
                message={search.trim() ? t("No customers match this search.") : t("No customers yet")}
                description={
                  search.trim()
                    ? t("Search by name, phone, ID number, or driver license.")
                    : t("Use Add Customer to create the first customer record.")
                }
                action={
                  !search.trim() && can("customers.create")
                    ? { label: t("Add Customer"), onClick: openCreateForm }
                    : undefined
                }
              />
            ) : (
              customerPage.rows.map((customer) => (
                <tr key={customer.id} className={rowClassName}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <CustomerPhotoAvatar
                        alt={customer.fullName}
                        className="size-10 border"
                        customerId={customer.id}
                      />
                      <div className="min-w-0">
                        <span className="block truncate font-semibold">{customer.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {t("Added")} <BidiValue value={formatDate(customer.createdAt)} />
                        </span>
                      </div>
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
                    <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDetails(customer)}
                    >
                      <Eye data-icon="inline-start" />
                      {t("Details")}
                    </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <PaginationControls page={customerPage} t={t} onPageChange={setPage} />
      </SectionPanel>

      <ReasonDialog
        open={Boolean(customerToDeactivate)}
        title={t("Deactivate customer?")}
        description={t("Deactivate customer confirmation")}
        reasonLabel={t("Reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Deactivate")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setCustomerToDeactivate(null)}
        onConfirm={(reason) => {
          if (customerToDeactivate) {
            void handleDeactivate(customerToDeactivate.id, reason);
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
