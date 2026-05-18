import { CheckCircle2, CreditCard, Plus, Search } from "lucide-react";
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
import type { PaymentInput, PaymentRecord } from "@/shared/payments";
import { calculateRentalDays } from "@/shared/rentals";
import type {
  RentalActivationInput,
  RentalFormOptions,
  RentalListRecord,
  RentalReturnInput,
} from "@/shared/rentals";
import { RentalForm } from "./RentalForm";
import { RentalPaymentPanel } from "./RentalPaymentPanel";
import { RentalReturnForm } from "./RentalReturnForm";
import { RentalStatusBadge } from "./RentalStatusBadge";

type RentalFormState =
  | {
      mode: "create";
    }
  | {
      mode: "return";
      rental: RentalListRecord;
    }
  | {
      mode: "payment";
      rental: RentalListRecord;
    }
  | null;

export function RentalsPage() {
  const [rentals, setRentals] = useState<RentalListRecord[]>([]);
  const [options, setOptions] = useState<RentalFormOptions>({
    customers: [],
    vehicles: [],
  });
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<RentalFormState>(null);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const loadRentals = useCallback(async (searchValue: string) => {
    setIsLoading(true);
    setListError(null);

    try {
      const records = await window.rentalApp.rentals.list(searchValue);
      setRentals(records);
      return records;
    } catch (error) {
      setListError(getErrorMessage(error, "Rentals could not be loaded."));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    const formOptions = await window.rentalApp.rentals.getFormOptions();
    setOptions(formOptions);
  }, []);

  const loadPayments = useCallback(async (rentalId: number) => {
    setPaymentError(null);

    try {
      const records = await window.rentalApp.payments.listForRental(rentalId);
      setPaymentRecords(records);
      return records;
    } catch (error) {
      setPaymentError(getErrorMessage(error, "Payments could not be loaded."));
      return [];
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadOptions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadOptions]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRentals(search);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadRentals, search]);

  const summary = useMemo(() => {
    return rentals.reduce(
      (values, rental) => {
        values.total += 1;

        if (rental.status === "active") {
          values.active += 1;
        }

        if (rental.status === "overdue") {
          values.overdue += 1;
        }

        if (rental.status === "returned") {
          values.returned += 1;
        }

        values.amount += rental.totalAmount;
        return values;
      },
      {
        total: 0,
        active: 0,
        overdue: 0,
        returned: 0,
        amount: 0,
      },
    );
  }, [rentals]);

  async function handleActivateRental(input: RentalActivationInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.rentals.activate(input);
      setFormState(null);
      await Promise.all([loadOptions(), loadRentals(search)]);
    } catch (error) {
      setFormError(getErrorMessage(error, "Rental could not be activated."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReturnRental(input: RentalReturnInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.rentals.return(input);
      setFormState(null);
      await Promise.all([loadOptions(), loadRentals(search)]);
    } catch (error) {
      setFormError(getErrorMessage(error, "Rental could not be returned."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreatePayment(input: PaymentInput) {
    setIsSaving(true);
    setPaymentError(null);

    try {
      await window.rentalApp.payments.create(input);
      const [updatedRentals] = await Promise.all([
        loadRentals(search),
        loadPayments(input.rentalId),
      ]);
      const updatedRental = updatedRentals.find(
        (rental) => rental.id === input.rentalId,
      );

      if (updatedRental) {
        setFormState({ mode: "payment", rental: updatedRental });
      }
    } catch (error) {
      setPaymentError(getErrorMessage(error, "Payment could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function openForm() {
    setFormError(null);
    await loadOptions();
    setFormState({ mode: "create" });
  }

  function openReturnForm(rental: RentalListRecord) {
    setFormError(null);
    setFormState({ mode: "return", rental });
  }

  async function openPaymentPanel(rental: RentalListRecord) {
    setPaymentError(null);
    setPaymentRecords([]);
    await loadPayments(rental.id);
    setFormState({ mode: "payment", rental });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search contract, customer, or plate"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Button onClick={() => void openForm()}>
          <Plus data-icon="inline-start" />
          New Rental
        </Button>
      </div>

      {formState?.mode === "create" ? (
        <RentalForm
          error={formError}
          isSaving={isSaving}
          options={options}
          onCancel={() => setFormState(null)}
          onSave={handleActivateRental}
        />
      ) : null}

      {formState?.mode === "return" ? (
        <RentalReturnForm
          error={formError}
          isSaving={isSaving}
          rental={formState.rental}
          onCancel={() => setFormState(null)}
          onSave={handleReturnRental}
        />
      ) : null}

      {formState?.mode === "payment" ? (
        <RentalPaymentPanel
          error={paymentError}
          isSaving={isSaving}
          payments={paymentRecords}
          rental={formState.rental}
          onCancel={() => setFormState(null)}
          onSave={handleCreatePayment}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-2">
        <SummaryBadge label="Total Rentals" value={String(summary.total)} />
        <SummaryBadge label="Active" value={String(summary.active)} />
        <SummaryBadge label="Overdue" value={String(summary.overdue)} />
        <SummaryBadge label="Returned" value={String(summary.returned)} />
        <SummaryBadge label="Rent Total" value={formatMoney(summary.amount)} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Rental List</CardTitle>
              <CardDescription>
                Search by contract number, customer name, or plate number.
              </CardDescription>
            </div>
            <Badge variant="secondary">{rentals.length} shown</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {listError ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {listError}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <Th>Contract</Th>
                  <Th>Customer</Th>
                  <Th>Vehicle</Th>
                  <Th>Start</Th>
                  <Th>Expected Return</Th>
                  <Th>Days</Th>
                  <Th>Total</Th>
                  <Th>Paid</Th>
                  <Th>Remaining</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <EmptyRow message="Loading rentals..." />
                ) : rentals.length === 0 ? (
                  <EmptyRow
                    message={
                      search.trim()
                        ? "No rentals match this search."
                        : "No rentals yet. Use New Rental to activate the first one."
                    }
                  />
                ) : (
                  rentals.map((rental) => (
                    <tr key={rental.id} className="border-t">
                      <Td>
                        <span className="font-semibold">{rental.contractNo}</span>
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{rental.customerName}</span>
                          <span className="text-xs text-muted-foreground">
                            {rental.customerPhone}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {rental.vehiclePlateNumber}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {rental.vehicleBrand} {rental.vehicleModel}
                          </span>
                        </div>
                      </Td>
                      <Td>{formatDateTime(rental.startDatetime)}</Td>
                      <Td>{formatDateTime(rental.expectedReturnDatetime)}</Td>
                      <Td>
                        {calculateDaysLabel(
                          rental.startDatetime,
                          rental.expectedReturnDatetime,
                        )}
                      </Td>
                      <Td>{formatMoney(rental.totalAmount)}</Td>
                      <Td>{formatMoney(rental.paidAmount)}</Td>
                      <Td>{formatMoney(rental.remainingAmount)}</Td>
                      <Td>
                        <RentalStatusBadge status={rental.status} />
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openPaymentPanel(rental)}
                          >
                            <CreditCard data-icon="inline-start" />
                            Record Payment
                          </Button>
                          {rental.status === "active" ||
                          rental.status === "overdue" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReturnForm(rental)}
                          >
                            <CheckCircle2 data-icon="inline-start" />
                            Return Vehicle
                          </Button>
                          ) : null}
                        </div>
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

function SummaryBadge({ label, value }: { label: string; value: string }) {
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
      <td className="px-4 py-12 text-center text-muted-foreground" colSpan={11}>
        {message}
      </td>
    </tr>
  );
}

function calculateDaysLabel(startDatetime: string, expectedReturnDatetime: string) {
  return String(calculateRentalDays(startDatetime, expectedReturnDatetime));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
