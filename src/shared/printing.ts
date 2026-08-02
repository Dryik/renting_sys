export type PrintDocumentResult =
  | { status: "printed" }
  | { status: "saved"; filePath: string }
  | { status: "cancelled" };
