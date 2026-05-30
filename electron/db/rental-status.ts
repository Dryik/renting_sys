import { sql, type SQL } from "drizzle-orm";
import type { RentalStatus } from "../../src/shared/rentals";
import { rentals } from "./schema";

export function getEffectiveRentalStatus(
  status: RentalStatus,
  expectedReturnDatetime: string,
  nowIso = new Date().toISOString(),
): RentalStatus {
  if (
    status === "active" &&
    new Date(expectedReturnDatetime).getTime() < new Date(nowIso).getTime()
  ) {
    return "overdue";
  }

  return status;
}

export function effectiveRentalStatusSql(nowIso: string): SQL<RentalStatus> {
  return sql<RentalStatus>`case when ${rentals.status} = 'active' and ${rentals.expectedReturnDatetime} < ${nowIso} then 'overdue' else ${rentals.status} end`;
}

export function effectiveActiveRentalFilter(nowIso: string): SQL {
  return sql`${rentals.status} = 'active' and ${rentals.expectedReturnDatetime} >= ${nowIso}`;
}

export function effectiveOverdueRentalFilter(nowIso: string): SQL {
  return sql`${rentals.status} = 'overdue' or (${rentals.status} = 'active' and ${rentals.expectedReturnDatetime} < ${nowIso})`;
}
