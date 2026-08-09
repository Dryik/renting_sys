/** Types for the rehearsal's independent restatement of the money rules. */
export type RehearsalMoneyPair = {
  table: string;
  legacyColumn: string;
  minorColumn: string;
  nullable: boolean;
};

export declare function toMinorUnits(value: number): number;
export declare function toMinorUnitsOrNull(value: number | null | undefined): number | null;
export declare const expectedMoneyPairs: readonly RehearsalMoneyPair[];
export declare function expectedTriggerNames(pair: RehearsalMoneyPair): string[];
export declare const expectedTriggerNameList: readonly string[];
