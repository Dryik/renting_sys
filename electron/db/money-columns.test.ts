import { describe, expect, it } from "vitest";
import {
  moneyColumnPairs,
  moneyMinorColumnDefinition,
  moneyMirrorTriggerSql,
  triggerName,
  type MoneyColumnPair,
} from "./money-columns";
import { allIndexSql, allTableSql } from "./table-ddl";

/**
 * The expected inventory, written out by hand.
 *
 * This list is deliberately not derived from `moneyColumnPairs` — deriving it
 * would make the test agree with any mistake the registry makes. A column
 * added, removed or misspelled there has to be corrected here too, by someone
 * who checked it against the schema.
 */
const expectedPairs: Array<[table: string, legacy: string, nullable: boolean]> = [
  ["vehicles", "daily_price", false],
  ["vehicles", "deposit_amount", false],
  ["vehicles", "commission_rate_override", true],
  ["vehicle_sales", "sale_price", false],
  ["rentals", "daily_price", false],
  ["rentals", "deposit_required", false],
  ["rentals", "deposit_paid", false],
  ["rentals", "extra_charges", false],
  ["rentals", "accessory_charges", false],
  ["rentals", "discount", false],
  ["rentals", "total_amount", false],
  ["rentals", "paid_amount", false],
  ["rentals", "remaining_amount", false],
  ["rentals", "commission_rate_per_day", false],
  ["rentals", "commission_amount", false],
  ["accessories", "default_charge", false],
  ["rental_accessories", "unit_charge", false],
  ["rental_collateral_items", "estimated_value", true],
  ["rental_vehicle_segments", "daily_price", false],
  ["payments", "amount", false],
  ["expenses", "amount", false],
  ["cash_movements", "amount", false],
  ["employee_loans", "amount", false],
  ["employee_loans", "remaining_amount", false],
  ["employee_loan_payments", "amount", false],
  ["accounting_adjustments", "amount", false],
  ["maintenance_records", "cost", false],
  ["daily_closings", "expected_cash", false],
  ["daily_closings", "counted_cash", false],
  ["daily_closings", "difference", false],
];

const key = (pair: MoneyColumnPair): string => `${pair.table}.${pair.legacyColumn}`;

describe("the money column registry", () => {
  it("holds exactly the 30 audited pairs", () => {
    expect(moneyColumnPairs).toHaveLength(30);
    expect(expectedPairs).toHaveLength(30);
    expect(moneyColumnPairs.map(key).sort()).toEqual(
      expectedPairs.map(([table, legacy]) => `${table}.${legacy}`).sort(),
    );
  });

  it("names every minor column after its mirror", () => {
    for (const pair of moneyColumnPairs) {
      expect(pair.minorColumn).toBe(`${pair.legacyColumn}_minor`);
    }
  });

  it("marks exactly the two columns that were already nullable", () => {
    const nullable = moneyColumnPairs.filter((pair) => pair.nullable).map(key).sort();

    expect(nullable).toEqual([
      "rental_collateral_items.estimated_value",
      "vehicles.commission_rate_override",
    ]);
  });

  it("matches the nullability recorded in the expected inventory", () => {
    const expectedNullability = new Map(
      expectedPairs.map(([table, legacy, nullable]) => [`${table}.${legacy}`, nullable]),
    );

    for (const pair of moneyColumnPairs) {
      expect(pair.nullable).toBe(expectedNullability.get(key(pair)));
    }
  });

  it("lists no pair twice", () => {
    expect(new Set(moneyColumnPairs.map(key)).size).toBe(moneyColumnPairs.length);
  });

  it("declares required columns not null and nullable columns plain integer", () => {
    for (const pair of moneyColumnPairs) {
      expect(moneyMinorColumnDefinition(pair)).toBe(
        pair.nullable ? "integer" : "integer not null default 0",
      );
    }
  });
});

describe("the fresh schema", () => {
  it("creates every minor column the registry knows about", () => {
    for (const pair of moneyColumnPairs) {
      expect(allTableSql).toContain(
        `${pair.minorColumn} ${moneyMinorColumnDefinition(pair)}`,
      );
    }
  });

  it("declares no REAL money column the registry has not claimed", () => {
    const realColumns = [...allTableSql.matchAll(/^\s+(\w+) real\b/gm)].map(
      (match) => match[1],
    );

    expect(realColumns).toHaveLength(30);

    for (const column of realColumns) {
      expect(moneyColumnPairs.some((pair) => pair.legacyColumn === column)).toBe(true);
    }
  });

  it("indexes the minor columns rather than their mirrors", () => {
    expect(allIndexSql).toContain(
      "on rentals(status, remaining_amount_minor)",
    );
    expect(allIndexSql).toContain(
      "on payments(status, type, rental_id, amount_minor)",
    );
    expect(allIndexSql).not.toMatch(/on rentals\(status, remaining_amount\)/);
    expect(allIndexSql).not.toMatch(/rental_id, amount\)/);
  });
});

describe("the mirror trigger definitions", () => {
  it("builds an insert and an update trigger for every pair", () => {
    for (const pair of moneyColumnPairs) {
      const sql = moneyMirrorTriggerSql(pair);

      expect(sql).toContain(`before insert on ${pair.table}`);
      expect(sql).toContain(
        `before update of ${pair.legacyColumn}, ${pair.minorColumn} on ${pair.table}`,
      );
      expect(sql).toContain(triggerName(pair, "insert"));
      expect(sql).toContain(triggerName(pair, "update"));
    }
  });

  it("checks both members of a nullable pair for presence", () => {
    const nullablePair = moneyColumnPairs.find((pair) => pair.nullable);
    const sql = moneyMirrorTriggerSql(nullablePair!);

    expect(sql).toContain(
      `(new.${nullablePair!.legacyColumn} is null) <> (new.${nullablePair!.minorColumn} is null)`,
    );
  });

  it("does not add a null check to a required pair", () => {
    const requiredPair = moneyColumnPairs.find((pair) => !pair.nullable);

    expect(moneyMirrorTriggerSql(requiredPair!)).not.toContain("is null");
  });

  it("gives every trigger a distinct name", () => {
    const names = moneyColumnPairs.flatMap((pair) => [
      triggerName(pair, "insert"),
      triggerName(pair, "update"),
    ]);

    expect(new Set(names).size).toBe(60);
  });
});
