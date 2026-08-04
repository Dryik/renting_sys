import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { CustomerRecord } from "@/shared/customers";
import type { PageResult } from "@/shared/pagination";
import type { RentalListRecord } from "@/shared/rentals";
import { RentalStatusBadge } from "@/features/rentals/RentalStatusBadge";

const emptyCustomerPage: PageResult<CustomerRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

const emptyRentalPage: PageResult<RentalListRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export function CustomerRentalHistoryReport() {
  const { formatCurrency, formatDate, t } = useI18n();
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(emptyCustomerPage);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [rentalPage, setRentalPage] = useState(emptyRentalPage);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingRentals, setLoadingRentals] = useState(false);
  const [page, setPage] = useState(1);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);

    try {
      const result = await window.rentalApp.customers.list({
        page: 1,
        search: customerSearch,
      });
      setCustomerPage(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCustomers(false);
    }
  }, [customerSearch]);

  const loadRentals = useCallback(async (nextPage = page) => {
    if (!selectedCustomer) {
      setRentalPage(emptyRentalPage);
      return;
    }

    setLoadingRentals(true);

    try {
      const data = await window.rentalApp.reports.getCustomerRentalHistory({
        customerId: selectedCustomer.id,
        page: nextPage,
      });
      setRentalPage(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRentals(false);
    }
  }, [page, selectedCustomer]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCustomers();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadCustomers]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRentals(page);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadRentals, page]);

  function selectCustomer(customer: CustomerRecord) {
    setSelectedCustomer(customer);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="ps-10"
          placeholder={t("Search name, phone, ID, or license")}
          value={customerSearch}
          onChange={(event) => setCustomerSearch(event.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-medium">{t("Customer")}</h3>
          <Badge variant="secondary">{t("{{count}} shown", { count: customerPage.total })}</Badge>
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-2">
          {loadingCustomers ? (
            <div className="p-3 text-sm text-muted-foreground">{t("Loading customers...")}</div>
          ) : customerPage.rows.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">{t("No customers match this search.")}</div>
          ) : (
            customerPage.rows.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => selectCustomer(customer)}
                className={cn(
                  "rounded-md border px-3 py-2 text-start text-sm hover:bg-muted/50",
                  selectedCustomer?.id === customer.id && "border-primary bg-accent",
                )}
              >
                <div className="font-medium">{customer.fullName}</div>
                <BidiValue className="text-xs text-muted-foreground" value={customer.phone} />
              </button>
            ))
          )}
        </div>
      </div>

      {selectedCustomer ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="text-xs font-semibold text-muted-foreground">{t("Selected Customer")}</div>
          <div className="mt-1 font-bold">{selectedCustomer.fullName}</div>
        </div>
      ) : null}

      <DataTable className="min-w-full">
        <thead>
          <tr>
            <Th>{t("Contract No")}</Th>
            <Th>{t("Vehicle")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-end">{t("Balance")}</Th>
          </tr>
        </thead>
        <tbody>
          {loadingRentals ? (
            <EmptyTableRow colSpan={4} message={t("Loading...")} state="loading" />
          ) : !selectedCustomer ? (
            <EmptyTableRow colSpan={4} message={t("Select a customer to see rental history.")} />
          ) : rentalPage.rows.length === 0 ? (
            <EmptyTableRow colSpan={4} message={t("This customer has no rentals yet.")} />
          ) : (
            rentalPage.rows.map((rental) => (
              <tr key={rental.id} className="border-t">
                <Td>
                  <div className="font-medium"><BidiValue value={rental.contractNo} /></div>
                  <div className="text-xs text-muted-foreground">
                    <BidiValue value={formatDate(rental.startDatetime)} />
                  </div>
                </Td>
                <Td>
                  <div className="truncate font-medium">
                    {rental.vehicleBrand} {rental.vehicleModel}
                  </div>
                  <div className="truncate text-muted-foreground">
                    <BidiValue value={rental.vehiclePlateNumber} />
                  </div>
                </Td>
                <Td>
                  <RentalStatusBadge status={rental.status} />
                </Td>
                <Td className="text-end">
                  <div className="font-medium">
                    <BidiValue value={formatCurrency(rental.totalAmount)} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rental.remainingAmount < 0 ? t("Customer Credit") : t("Amount Due")}{" "}
                    <MoneyText
                      amount={rental.remainingAmount}
                      className="text-xs"
                      formatCurrency={formatCurrency}
                    />
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <PaginationControls page={rentalPage} t={t} onPageChange={setPage} />
    </div>
  );
}
