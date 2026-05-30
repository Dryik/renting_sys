import { BidiValue } from "@/components/ui/bidi-value";
import { cn } from "@/lib/utils";

type MoneyTextProps = {
  amount: number;
  className?: string;
  formatCurrency: (amount: number) => string;
  showCreditLabel?: boolean;
  t?: (key: string) => string;
};

export function MoneyText({
  amount,
  className,
  formatCurrency,
  showCreditLabel = false,
  t,
}: MoneyTextProps) {
  const isCredit = amount < 0;
  const displayAmount = isCredit ? Math.abs(amount) : amount;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 font-semibold",
        isCredit ? "text-success" : "text-foreground",
        className,
      )}
    >
      {showCreditLabel && isCredit && t ? (
        <span className="text-xs font-semibold text-success">{t("Credit")}</span>
      ) : null}
      <BidiValue value={formatCurrency(displayAmount)} />
    </span>
  );
}
