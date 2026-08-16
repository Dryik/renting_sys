export type CleanupSummary = {
  appVersion: string;
  schemaVersion: number;
  customersPreserved: number;
  vehiclesPreserved: number;
  usersPreserved: number;
  customerVehicleAttachmentsPreserved: number;
  otherAttachmentsRemoved: number;
  vehiclesResetToAvailable: number;
  tableCounts: Record<string, number>;
};

export const TARGET_APP_VERSION: "0.3.9";
export const TARGET_SCHEMA_VERSION: 11;
export const CONFIRMATION_PHRASE: string;
export const expectedTables: string[];
export const clearedTables: string[];

export function validateTargetDatabase(database: unknown): { schemaVersion: number };
export function analyzeDatabase(database: unknown): CleanupSummary;
export function cleanDatabase(database: unknown): {
  before: CleanupSummary;
  after: CleanupSummary;
  preservedSnapshot: Record<string, string>;
  removedAttachmentPaths: string[];
};
export function inspectBackupArchive(inputPath: string): {
  inputPath: string;
  metadata: Record<string, unknown>;
  zip: unknown;
};
export function dryRunBackupArchive(inputPath: string): CleanupSummary;
export function transformBackupArchive(inputPath: string, outputPath: string): {
  before: CleanupSummary;
  after: CleanupSummary;
  preservedSnapshot: Record<string, string>;
  removedAttachmentPaths: string[];
  inputPath: string;
  outputPath: string;
};
export function createVerifiedInstalledBackup(
  dataDirectory: string,
  backupPath: string,
): { backupPath: string; summary: CleanupSummary };
export function cleanInstalledData(
  dataDirectory: string,
  backupPath: string,
): {
  before: CleanupSummary;
  after: CleanupSummary;
  preservedSnapshot: Record<string, string>;
  removedAttachmentPaths: string[];
  backupPath: string;
  dataDirectory: string;
};
export function analyzeInstalledData(dataDirectory: string): CleanupSummary;
export function hasRentalDeskProcess(taskListOutput: string): boolean;
export function removeClearedAttachmentFiles(
  stagingPath: string,
  attachmentPaths: string[],
): void;
