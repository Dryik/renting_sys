import { describe, expect, it } from "vitest";
import {
  calculateAccountingTotals,
  calculateDailyClosingDifference,
  calculateLocationBalances,
  applyBalanceDeltas,
  formatMoneyLocation,
  getNegativeBalanceLocations,
  type AccountingBalanceInput,
} from "./accounting";

describe("accounting cashbook helpers", () => {
  it("calculates drawer, safe, and bank balances", () => {
    const balances = calculateLocationBalances([
      { kind: "money_in", location: "cash_drawer", amount: 100 },
      { kind: "money_in", location: "bank", amount: 250 },
      { kind: "money_out", location: "cash_drawer", amount: 20, outflowType: "expense" },
      { kind: "transfer", fromLocation: "cash_drawer", toLocation: "shop_safe", amount: 50 },
    ]);

    expect(balances).toEqual({
      bank: 250,
      cash_drawer: 30,
      shop_safe: 50,
    });
  });

  it("does not change total shop cash when moving money between locations", () => {
    const transactions: AccountingBalanceInput[] = [
      { kind: "money_in", location: "cash_drawer", amount: 100 },
      { kind: "transfer", fromLocation: "cash_drawer", toLocation: "shop_safe", amount: 70 },
      { kind: "transfer", fromLocation: "shop_safe", toLocation: "bank", amount: 25 },
    ];
    const beforeTransfer = calculateLocationBalances([transactions[0]!]);
    const afterTransfer = calculateLocationBalances(transactions);
    const beforeTotal =
      beforeTransfer.cash_drawer + beforeTransfer.shop_safe + beforeTransfer.bank;
    const afterTotal =
      afterTransfer.cash_drawer + afterTransfer.shop_safe + afterTransfer.bank;

    expect(afterTotal).toBe(beforeTotal);
    expect(afterTransfer).toEqual({
      bank: 25,
      cash_drawer: 30,
      shop_safe: 45,
    });
  });

  it("keeps owner withdrawals separate from expenses", () => {
    const totals = calculateAccountingTotals([
      { kind: "money_in", location: "cash_drawer", amount: 300 },
      {
        kind: "money_out",
        location: "shop_safe",
        amount: 75,
        outflowType: "owner_withdrawal",
      },
      { kind: "money_out", location: "cash_drawer", amount: 25, outflowType: "expense" },
    ]);

    expect(totals.ownerWithdrawals).toBe(75);
    expect(totals.expenses).toBe(25);
    expect(totals.netAfterExpenses).toBe(275);
  });

  it("subtracts refunds and expenses from net after expenses", () => {
    const totals = calculateAccountingTotals([
      { kind: "money_in", location: "bank", amount: 500 },
      { kind: "money_out", location: "bank", amount: 50, outflowType: "refund" },
      { kind: "money_out", location: "cash_drawer", amount: 35, outflowType: "expense" },
    ]);

    expect(totals.moneyIn).toBe(500);
    expect(totals.refunds).toBe(50);
    expect(totals.expenses).toBe(35);
    expect(totals.netAfterExpenses).toBe(415);
  });

  it("counts posted vehicle sales as money in and ignores voided sales", () => {
    const totals = calculateAccountingTotals([
      { kind: "money_in", location: "cash_drawer", amount: 9000 },
      { kind: "money_in", location: "bank", amount: 12000, status: "voided" },
    ]);
    const balances = calculateLocationBalances([
      { kind: "money_in", location: "cash_drawer", amount: 9000 },
      { kind: "money_in", location: "bank", amount: 12000, status: "voided" },
    ]);

    expect(totals.moneyIn).toBe(9000);
    expect(totals.netAfterExpenses).toBe(9000);
    expect(balances).toEqual({
      bank: 0,
      cash_drawer: 9000,
      shop_safe: 0,
    });
  });

  it("ignores voided expenses and movements", () => {
    const balances = calculateLocationBalances([
      { kind: "money_in", location: "cash_drawer", amount: 100 },
      {
        kind: "money_out",
        location: "cash_drawer",
        amount: 40,
        outflowType: "expense",
        status: "voided",
      },
      {
        kind: "transfer",
        fromLocation: "cash_drawer",
        toLocation: "shop_safe",
        amount: 25,
        status: "voided",
      },
    ]);

    expect(balances).toEqual({
      bank: 0,
      cash_drawer: 100,
      shop_safe: 0,
    });
  });

  it("calculates daily closing cash difference", () => {
    expect(calculateDailyClosingDifference(120.12, 125.62)).toBe(5.5);
    expect(calculateDailyClosingDifference(120, 117.25)).toBe(-2.75);
  });

  it("applies balance adjustments without changing income or expense totals", () => {
    const transactions: AccountingBalanceInput[] = [
      {
        kind: "adjustment",
        location: "cash_drawer",
        amount: 500,
        adjustmentDirection: "increase",
      },
      {
        kind: "adjustment",
        location: "bank",
        amount: 100,
        adjustmentDirection: "decrease",
      },
    ];

    expect(calculateLocationBalances(transactions)).toEqual({
      bank: -100,
      cash_drawer: 500,
      shop_safe: 0,
    });
    expect(calculateAccountingTotals(transactions)).toEqual({
      expenses: 0,
      moneyIn: 0,
      netAfterExpenses: 0,
      ownerWithdrawals: 0,
      refunds: 0,
    });
  });

  it("detects projected negative balances", () => {
    const projected = applyBalanceDeltas(
      { bank: 50, cash_drawer: 20, shop_safe: 0 },
      [
        { location: "cash_drawer", amount: -25 },
        { location: "bank", amount: -10 },
      ],
    );

    expect(projected.cash_drawer).toBe(-5);
    expect(getNegativeBalanceLocations(projected)).toEqual(["cash_drawer"]);
  });

  it("formats internal location keys for display", () => {
    expect(formatMoneyLocation("cash_drawer", "en")).toBe("Cash Drawer");
    expect(formatMoneyLocation("shop_safe", "ar")).toBe("خزنة المحل");
  });
});
