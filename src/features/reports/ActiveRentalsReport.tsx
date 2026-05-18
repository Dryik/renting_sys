import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatRentalStatus, type RentalListRecord } from "@/shared/rentals";

export function ActiveRentalsReport() {
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
    return <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[1fr_2fr_1fr_1fr] bg-muted px-4 py-3 text-sm font-medium">
        <span>Contract No</span>
        <span>Customer & Vehicle</span>
        <span>Dates</span>
        <span className="text-right">Balance</span>
      </div>
      {rentals.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
          No active rentals.
        </div>
      ) : (
        <div className="divide-y">
          {rentals.map((rental) => (
            <div
              key={rental.id}
              className="grid grid-cols-[1fr_2fr_1fr_1fr] items-center gap-4 px-4 py-3 text-sm hover:bg-muted/50"
            >
              <div>
                <div className="font-medium">{rental.contractNo}</div>
                <Badge variant="secondary" className="mt-1">
                  {formatRentalStatus(rental.status)}
                </Badge>
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{rental.customerName}</div>
                <div className="truncate text-muted-foreground">
                  {rental.vehicleBrand} {rental.vehicleModel} - {rental.vehiclePlateNumber}
                </div>
              </div>
              <div>
                <div className="truncate">Out: {new Date(rental.startDatetime).toLocaleDateString()}</div>
                <div className="truncate text-muted-foreground">
                  Exp: {new Date(rental.expectedReturnDatetime).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">${rental.totalAmount.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">
                  Rem: ${rental.remainingAmount.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
