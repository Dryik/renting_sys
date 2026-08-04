import { useEffect, useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { MoneyText } from "@/components/ui/money-text";
import { useI18n } from "@/hooks/useI18n";
import type { RentalListRecord } from "@/shared/rentals";
import { RentalStatusBadge } from "@/features/rentals/RentalStatusBadge";
import { ReportExportButtons } from "./ReportExportButtons";

export function OverdueRentalsReport() {
  const { formatCurrency, formatDate, t } = useI18n();
  const [rentals, setRentals] = useState<RentalListRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.rentalApp.reports
      .getOverdueRentals()
      .then((data) => {
        setRentals(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-4 text-center text-sm text-muted-foreground">{t("Loading...")}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ReportExportButtons type="overdueRentals" disabled={rentals.length === 0} />
      </div>
      <DataTable className="min-w-full">
      <thead>
        <tr>
          <Th>{t("Contract No")}</Th>
          <Th>{t("Customer & Vehicle")}</Th>
          <Th>{t("Dates")}</Th>
          <Th className="text-end">{t("Balance")}</Th>
        </tr>
      </thead>
      <tbody>
      {rentals.length === 0 ? (
        <EmptyTableRow colSpan={4} message={t("No overdue rentals.")} />
      ) : (
        <>
          {rentals.map((rental) => (
            <tr
              key={rental.id}
            >
              <Td>
                <BidiValue className="font-medium" value={rental.contractNo} />
                <div className="mt-1">
                  <RentalStatusBadge status={rental.status} />
                </div>
              </Td>
              <Td>
                <div className="truncate font-medium">{rental.customerName}</div>
                <div className="truncate text-muted-foreground">
                  {rental.vehicleBrand} {rental.vehicleModel} - <BidiValue value={rental.vehiclePlateNumber} />
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-x-1">
                  <span>{t("Out:")}</span>
                  <BidiValue value={formatDate(rental.startDatetime)} />
                </div>
                <div className="flex flex-wrap items-center gap-x-1 font-medium text-destructive">
                  <span>{t("Exp:")}</span>
                  <BidiValue value={formatDate(rental.expectedReturnDatetime)} />
                </div>
              </Td>
              <Td className="text-end">
                <div className="font-medium">
                  <BidiValue value={formatCurrency(rental.totalAmount)} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {rental.remainingAmount < 0 ? t("Credit") : t("Remaining")}{" "}
                  <MoneyText
                    amount={rental.remainingAmount}
                    className="text-xs"
                    formatCurrency={formatCurrency}
                  />
                </div>
              </Td>
            </tr>
          ))}
        </>
      )}
      </tbody>
      </DataTable>
    </div>
  );
}
