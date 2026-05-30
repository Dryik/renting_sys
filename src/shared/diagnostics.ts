export type DiagnosticsStatus = {
  appVersion: string;
  databasePath: string;
  uploadsPath: string;
  databaseSizeBytes: number;
  uploadsSizeBytes: number;
  integrityCheck: string;
  foreignKeyCheckCount: number;
  tableCounts: Record<string, number>;
};
