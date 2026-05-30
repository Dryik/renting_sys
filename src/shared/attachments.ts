import { z } from "zod";
import type { PageRequest } from "./pagination";

export const attachmentEntityTypes = [
  "customer",
  "vehicle",
  "rental",
  "maintenance",
] as const;

export type AttachmentEntityType = (typeof attachmentEntityTypes)[number];

export const customerDocumentTypes = [
  "customer_photo",
  "passport",
  "national_id",
  "driver_license",
  "driver_license_front",
  "driver_license_back",
  "other",
] as const;

export const vehicleDocumentTypes = [
  "vehicle_photo",
  "vehicle_booklet",
  "insurance",
  "registration",
  "inspection",
  "other",
] as const;

export const attachmentDocumentTypes = [
  ...customerDocumentTypes,
  ...vehicleDocumentTypes.filter((type) => type !== "other"),
] as const;

export type CustomerDocumentType = (typeof customerDocumentTypes)[number];
export type VehicleDocumentType = (typeof vehicleDocumentTypes)[number];
export type AttachmentDocumentType = (typeof attachmentDocumentTypes)[number];

export const attachmentDocumentLabelKeys: Record<AttachmentDocumentType, string> = {
  customer_photo: "Customer Photo",
  passport: "Passport",
  national_id: "National ID",
  driver_license: "Driver License",
  driver_license_front: "Driver License Front",
  driver_license_back: "Driver License Back",
  vehicle_photo: "Vehicle Photo",
  vehicle_booklet: "Vehicle Booklet",
  insurance: "Insurance",
  registration: "Registration",
  inspection: "Inspection",
  other: "Other",
};

export const allowedAttachmentMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedAttachmentMimeType = (typeof allowedAttachmentMimeTypes)[number];

export const maxImageAttachmentBytes = 10 * 1024 * 1024;
export const maxPdfAttachmentBytes = 20 * 1024 * 1024;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional();

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date is invalid.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const attachmentMetadataSchema = z
  .object({
    entityType: z.enum(attachmentEntityTypes),
    entityId: z.number().int().positive(),
    documentType: z.enum(attachmentDocumentTypes),
    title: nullableText(120),
    documentNumber: nullableText(120),
    issueDate: optionalDate,
    expiryDate: optionalDate,
    notes: nullableText(500),
    isPrimary: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (!isAttachmentDocumentTypeAllowed(value.entityType, value.documentType)) {
      context.addIssue({
        code: "custom",
        message: "Document type is not allowed for this record.",
        path: ["documentType"],
      });
    }
  });

export const attachmentListRequestSchema = z.object({
  entityType: z.enum(attachmentEntityTypes),
  entityId: z.number().int().positive(),
  includeArchived: z.boolean().optional(),
});

export type AttachmentListRequest = z.infer<typeof attachmentListRequestSchema> &
  PageRequest;

export const attachmentUploadRequestSchema = attachmentMetadataSchema;

export type AttachmentUploadRequest = z.infer<typeof attachmentUploadRequestSchema>;

export const attachmentAddRequestSchema = attachmentUploadRequestSchema
  .extend({
    attachmentType: z.string().trim().max(60).optional(),
  })
  .transform((value) => ({
    ...value,
    documentType: value.documentType,
  }));

export type AttachmentAddRequest = AttachmentUploadRequest & {
  attachmentType?: string;
};

export const attachmentReplaceRequestSchema = attachmentMetadataSchema.extend({
  attachmentId: z.number().int().positive(),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
});

export type AttachmentReplaceRequest = z.infer<typeof attachmentReplaceRequestSchema>;

export const attachmentArchiveRequestSchema = z.object({
  attachmentId: z.number().int().positive(),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
});

export type AttachmentArchiveRequest = z.infer<typeof attachmentArchiveRequestSchema>;

export const attachmentCapturedPhotoRequestSchema = z.object({
  entityType: z.literal("customer"),
  entityId: z.number().int().positive(),
  imageDataUrl: z
    .string()
    .startsWith("data:image/jpeg;base64,", "Captured photo must be a JPEG image."),
  cameraDeviceLabelSnapshot: nullableText(200),
  notes: nullableText(500),
});

export type AttachmentCapturedPhotoRequest = z.infer<
  typeof attachmentCapturedPhotoRequestSchema
>;

export const attachmentFileMetadataSchema = z.object({
  mimeType: z.enum(allowedAttachmentMimeTypes),
  fileSize: z.number().int().positive(),
});

export type AttachmentFileMetadata = z.infer<typeof attachmentFileMetadataSchema>;

export type AttachmentRecord = {
  id: number;
  entityType: AttachmentEntityType;
  entityId: number;
  documentType: AttachmentDocumentType;
  title: string | null;
  originalFileName: string;
  storedFileName: string;
  relativePath: string;
  thumbnailRelativePath: string | null;
  mimeType: AllowedAttachmentMimeType;
  fileSize: number;
  sha256: string;
  documentNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  capturedByCamera: boolean;
  cameraDeviceLabelSnapshot: string | null;
  isPrimary: boolean;
  createdAt: string;
  createdByUserId: number | null;
  createdByUserName: string | null;
  updatedAt: string;
  archivedAt: string | null;
  archivedByUserId: number | null;
  archiveReason: string | null;
};

export type AttachmentPreview = {
  attachment: AttachmentRecord;
  dataUrl: string | null;
};

export function getDocumentTypesForEntity(
  entityType: AttachmentEntityType,
): readonly AttachmentDocumentType[] {
  if (entityType === "customer") {
    return customerDocumentTypes;
  }

  if (entityType === "vehicle") {
    return vehicleDocumentTypes;
  }

  return ["other"];
}

export function isAttachmentDocumentTypeAllowed(
  entityType: AttachmentEntityType,
  documentType: AttachmentDocumentType,
): boolean {
  return getDocumentTypesForEntity(entityType).includes(documentType);
}

export function isPhotoDocumentType(documentType: AttachmentDocumentType): boolean {
  return documentType === "customer_photo" || documentType === "vehicle_photo";
}

export function isAllowedAttachmentMimeType(
  mimeType: string,
): mimeType is AllowedAttachmentMimeType {
  return allowedAttachmentMimeTypes.includes(mimeType as AllowedAttachmentMimeType);
}

export function getMaxAttachmentFileSize(mimeType: AllowedAttachmentMimeType): number {
  return mimeType === "application/pdf" ? maxPdfAttachmentBytes : maxImageAttachmentBytes;
}

export function formatAttachmentFileSize(
  bytes: number,
  language: "ar" | "en" = "en",
): string {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const isMegabytes = safeBytes >= 1024 * 1024;
  const value = isMegabytes
    ? trimTrailingZero((safeBytes / (1024 * 1024)).toFixed(1))
    : String(Math.max(1, Math.round(safeBytes / 1024)));

  if (language === "ar") {
    return `${value} ${isMegabytes ? "ميغابايت" : "كيلوبايت"}`;
  }

  return `${value} ${isMegabytes ? "MB" : "KB"}`;
}

export function validateAttachmentFileMetadata(metadata: AttachmentFileMetadata): void {
  const parsed = attachmentFileMetadataSchema.parse(metadata);
  const maxSize = getMaxAttachmentFileSize(parsed.mimeType);

  if (parsed.fileSize > maxSize) {
    throw new Error(
      parsed.mimeType === "application/pdf"
        ? "PDF documents must be 20 MB or smaller."
        : "Images must be 10 MB or smaller.",
    );
  }
}

export function isSafeStoredRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized)
  ) {
    return false;
  }

  return normalized.startsWith("uploads/");
}

function trimTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}
