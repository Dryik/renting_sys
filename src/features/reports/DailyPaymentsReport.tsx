import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatPaymentMethod, formatPaymentType } from "@/shared/payments";
import type { DailyPaymentRecord } from "@/shared/reports";

export function DailyPaymentsReport() {
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [payments, setPayments] = useState<DailyPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.rentalApp.reports
      .getDailyPayments(date)
      .then((data) => {
        setPayments(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [date]);

  const total = payments.reduce(
    (sum, payment) => sum + getSignedPaymentAmount(payment),
    0,
  );

  function handleDateChange(value: string) {
    setLoading(true);
    setDate(value);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <label htmlFor="paymentDate" className="text-sm font-medium">
          Payment Date
        </label>
        <Input
          id="paymentDate"
          type="date"
          value={date}
          onChange={(event) => handleDateChange(event.target.value)}
          className="w-40"
        />
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr] bg-muted px-4 py-3 text-sm font-medium">
          <span>Date</span>
          <span>Rental & Customer</span>
          <span>Type</span>
          <span>Method</span>
          <span className="text-right">Amount</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : payments.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
            No payments recorded on this date.
          </div>
        ) : (
          <div className="divide-y">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr] items-center gap-4 px-4 py-3 text-sm hover:bg-muted/50"
              >
                <div className="truncate text-muted-foreground">
                  {new Date(payment.paymentDate).toLocaleDateString()}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{payment.contractNo}</div>
                  <div className="truncate text-muted-foreground">{payment.customerName}</div>
                </div>
                <div>
                  <Badge variant="outline" className="capitalize">
                    {formatPaymentType(payment.type)}
                  </Badge>
                </div>
                <div>
                  <span className="capitalize text-muted-foreground">
                    {formatPaymentMethod(payment.method)}
                  </span>
                </div>
                <div className="text-right font-medium">
                  {formatMoney(getSignedPaymentAmount(payment))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr] items-center gap-4 bg-muted/30 px-4 py-3 text-sm font-semibold">
              <div className="col-span-4 text-right">Total:</div>
              <div className="text-right">{formatMoney(total)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getSignedPaymentAmount(payment: DailyPaymentRecord): number {
  return payment.type === "refund" ? -payment.amount : payment.amount;
}

function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";

  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
