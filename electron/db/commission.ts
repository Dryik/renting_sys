export interface CommissionCalculationParams {
  rentedDays: number;
  dailyRate: number;
  status: "draft" | "active" | "returned" | "cancelled" | "overdue";
  userEarnsCommission: boolean;
  commissionEnabled?: boolean;
}

export function calculateCommission(params: CommissionCalculationParams): {
  commissionRatePerDay: number;
  commissionAmount: number;
} {
  const {
    rentedDays,
    dailyRate,
    status,
    userEarnsCommission,
    commissionEnabled = true,
  } = params;

  const effectiveRate = Math.max(0, dailyRate);

  if (!commissionEnabled || !userEarnsCommission) {
    return { commissionRatePerDay: 0, commissionAmount: 0 };
  }

  if (status === "cancelled" || status === "draft") {
    return { commissionRatePerDay: effectiveRate, commissionAmount: 0 };
  }

  const effectiveDays = Math.max(1, rentedDays);
  const amount = Number((effectiveDays * effectiveRate).toFixed(3));

  return {
    commissionRatePerDay: effectiveRate,
    commissionAmount: amount,
  };
}
