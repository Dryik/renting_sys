import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { useI18n } from "@/hooks/useI18n";
import { formatRentalStatus, type RentalListRecord } from "@/shared/rentals";

export function ActiveRentalsReport() {
  const { formatCurrency, formatDate, language, t } = useI18n();
  const [rentals, setRentals] = useState<RentalListRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.rentalApp.reports
      .getActiveRentals()
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
    <DataTable className="min-w-[760px]">
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
        <EmptyTableRow colSpan={4} message={t("No active rentals.")} />
      ) : (
        <>
          {rentals.map((rental) => (
            <tr
              key={rental.id}
            >
              <Td>
                <BidiValue className="font-medium" value={rental.contractNo} />
                <Badge variant="secondary" className="mt-1">
                  {formatRentalStatus(rental.status, language)}
                </Badge>
              </Td>
              <Td>
                <div className="truncate font-medium">{rental.customerName}</div>
                <div className="truncate text-muted-foreground">
                  {rental.vehicleBrand} {rental.vehicleModel} - <BidiValue value={rental.vehiclePlateNumber} />
                </div>
              </Td>
              <Td>
                <div className="truncate">{t("Out: {{value}}", { value: formatDate(rental.startDatetime) })}</div>
                <div className="truncate text-muted-foreground">
                  {t("Exp: {{value}}", { value: formatDate(rental.expectedReturnDatetime) })}
                </div>
              </Td>
              <Td className="text-end">
                <div className="font-medium">
                  <BidiValue value={formatCurrency(rental.totalAmount)} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("Remaining")} <BidiValue value={formatCurrency(rental.remainingAmount)} />
                </div>
              </Td>
            </tr>
          ))}
        </>
      )}
      </tbody>
    </DataTable>
  );
}
