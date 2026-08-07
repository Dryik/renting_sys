import {
  MONEY_MINOR_ZERO,
  maxMoney,
  multiplyMoney,
  type MoneyMinor,
} from "../../src/shared/money";

export interface CommissionCalculationParams {
  rentedDays: number;
  dailyRateMinor: MoneyMinor;
  status: "draft" | "active" | "returned" | "cancelled" | "overdue";
  userEarnsCommission: boolean;
  commissionEnabled?: boolean;
}

/**
 * A whole-day rate times whole rented days.
 *
 * The rate is kept even where the amount is zero, so a draft or cancelled
 * rental still records what it would have paid if it had run.
 */
export function calculateCommission(params: CommissionCalculationParams): {
  commissionRatePerDayMinor: MoneyMinor;
  commissionAmountMinor: MoneyMinor;
} {
  const {
    rentedDays,
    dailyRateMinor,
    status,
    userEarnsCommission,
    commissionEnabled = true,
  } = params;

  const effectiveRateMinor = maxMoney(dailyRateMinor, MONEY_MINOR_ZERO);

  if (!commissionEnabled || !userEarnsCommission) {
    return {
      commissionRatePerDayMinor: MONEY_MINOR_ZERO,
      commissionAmountMinor: MONEY_MINOR_ZERO,
    };
  }

  if (status === "cancelled" || status === "draft") {
    return {
      commissionRatePerDayMinor: effectiveRateMinor,
      commissionAmountMinor: MONEY_MINOR_ZERO,
    };
  }

  return {
    commissionRatePerDayMinor: effectiveRateMinor,
    commissionAmountMinor: multiplyMoney(
      effectiveRateMinor,
      Math.max(1, Math.trunc(rentedDays)),
      "the commission amount",
    ),
  };
}
