import { describe, expect, it } from "vitest";
import {
  calculateEmployeeLoanRemaining,
  getEmployeeLoanStatus,
} from "./employee-loans";
import {
  calculateAccountingTotals,
  calculateLocationBalances,
  type AccountingBalanceInput,
} from "./accounting";

describe("employee loan helpers", () => {
  it("calculates remaining balance and status from posted repayments", () => {
    const repayments = [
      { amount: 40, status: "posted" as const },
      { amount: 10, status: "voided" as const },
      { amount: 60, status: "posted" as const },
    ];

    expect(calculateEmployeeLoanRemaining(150, repayments)).toBe(50);
    expect(getEmployeeLoanStatus(150, repayments)).toBe("open");
    expect(getEmployeeLoanStatus(100, repayments)).toBe("paid");
  });

  it("moves cash balances without counting loans as income", () => {
    const inputs: AccountingBalanceInput[] = [
      {
        adjustmentDirection: "decrease",
        amount: 200,
        kind: "adjustment",
        location: "cash_drawer",
      },
      {
        adjustmentDirection: "increase",
        amount: 75,
        kind: "adjustment",
        location: "cash_drawer",
      },
    ];

    expect(calculateLocationBalances(inputs).cash_drawer).toBe(-125);
    expect(calculateAccountingTotals(inputs)).toEqual({
      expenses: 0,
      moneyIn: 0,
      netAfterExpenses: 0,
      ownerWithdrawals: 0,
      refunds: 0,
    });
  });
});
