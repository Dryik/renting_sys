export type SeedMileageScenario = Readonly<{
  vehicle: number;
  out: number | null;
  in: number | null;
}>;

export const seedMileageScenarios: Readonly<
  Record<"active" | "returned" | "cancelled" | "draft" | "sold", SeedMileageScenario>
>;

export function buildSeedExpression(options?: { ownerPassword?: string }): string;
