import { and, asc, count, eq } from "drizzle-orm";
import { app, dialog, shell } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  attachmentArchiveRequestSchema,
  attachmentCapturedPhotoRequestSchema,
  attachmentListRequestSchema,
  attachmentReplaceRequestSchema,
  attachmentUploadRequestSchema,
  isAllowedAttachmentMimeType,
  isPhotoDocumentType,
  isSafeStoredRelativePath,
  validateAttachmentFileMetadata,
  type AllowedAttachmentMimeType,
  type AttachmentArchiveRequest,
  type AttachmentCapturedPhotoRequest,
  type AttachmentDocumentType,
  type AttachmentEntityType,
  type AttachmentListRequest,
  type AttachmentPreview,
  type AttachmentRecord,
  type AttachmentReplaceRequest,
  type AttachmentUploadRequest,
} from "../../src/shared/attachments";
import type { Permission } from "../../src/shared/auth";
import type { PageResult } from "../../src/shared/pagination";
import { createPageResult, normalizePageRequest } from "./listing";
import { attachments, customers, maintenanceRecords, rentals, users, vehicles } from "./schema";
import { getDatabase } from "./database";
import { requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { recordAppEvent } from "./events.service";

type AttachmentRow = typeof attachments.$inferSelect;
type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

type AttachmentMutationKind = "create" | "replace" | "archive" | "capturePhoto";

const parentViewPermissionMap: Record<AttachmentEntityType, Permission> = {
  customer: "customers.view",
  vehicle: "vehicles.view",
  rental: "rentals.view",
  maintenance: "maintenance.view",
};

const documentPermissionMap: Record<
  "customer" | "vehicle",
  Record<AttachmentMutationKind | "view", Permission>
> = {
  customer: {
    view: "customers.documents.view",
    create: "customers.documents.create",
    replace: "customers.documents.replace",
    archive: "customers.documents.archive",
    capturePhoto: "customers.documents.capturePhoto",
  },
  vehicle: {
    view: "vehicles.documents.view",
    create: "vehicles.documents.create",
    replace: "vehicles.documents.replace",
    archive: "vehicles.documents.archive",
    capturePhoto: "vehicles.documents.create",
  },
};

function getUserDataPath(): string {
  return process.env.RENTAL_APP_USER_DATA_DIR
    ? path.resolve(process.env.RENTAL_APP_USER_DATA_DIR)
    : app.getPath("userData");
}

export function listAttachments(
  request: AttachmentListRequest,
): PageResult<AttachmentRecord> {
  const parsed = attachmentListRequestSchema.parse(request);
  requireAttachmentViewPermission(parsed.entityType);
  ensureAttachmentEntityExists(parsed.entityType, parsed.entityId);
  const pageRequest = normalizePageRequest(request);
  const filters = [
    eq(attachments.entityType, parsed.entityType),
    eq(attachments.entityId, parsed.entityId),
  ];

  if (!parsed.includeArchived) {
    filters.push(eq(attachments.isArchived, false));
  }

  const whereFilter = and(...filters);
  const total =
    getDatabase()
      .select({ count: count() })
      .from(attachments)
      .where(whereFilter)
      .get()?.count ?? 0;
  const rows = getDatabase()
    .select()
    .from(attachments)
    .where(whereFilter)
    .orderBy(asc(attachments.createdAt), asc(attachments.id))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all()
    .map(toAttachmentRecord);

  return createPageResult(rows, total, pageRequest);
}

export async function addAttachment(
  input: AttachmentUploadRequest,
): Promise<AttachmentRecord | null> {
  return uploadAttachment(input);
}

export async function uploadAttachment(
  input: AttachmentUploadRequest,
): Promise<AttachmentRecord | null> {
  const values = attachmentUploadRequestSchema.parse(input);
  const actor = requireAttachmentMutationPermission(values.entityType, "create");
  ensureAttachmentEntityExists(values.entityType, values.entityId);

  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Upload Document",
    filters: [
      { name: "Documents and Photos", extensions: ["jpg", "jpeg", "png", "webp", "pdf"] },
    ],
    properties: ["openFile"],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return createAttachmentFromSourcePath({
    sourcePath: filePaths[0]!,
    values,
    actorUserId: actor.id,
    capturedByCamera: false,
    cameraDeviceLabelSnapshot: null,
    auditKind: "added",
  });
}

export async function replaceAttachment(
  input: AttachmentReplaceRequest,
): Promise<AttachmentRecord | null> {
  const values = attachmentReplaceRequestSchema.parse(input);
  const existing = getAttachmentById(values.attachmentId);
  const actor = requireAttachmentMutationPermission(existing.entityType, "replace");

  if (existing.isArchived) {
    throw new Error("Archived documents cannot be replaced.");
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Replace Document",
    filters: [
      { name: "Documents and Photos", extensions: ["jpg", "jpeg", "png", "webp", "pdf"] },
    ],
    properties: ["openFile"],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const replacement = createAttachmentFromSourcePath({
    sourcePath: filePaths[0]!,
    values: {
      entityType: existing.entityType,
      entityId: existing.entityId,
      documentType: values.documentType,
      title: values.title,
      documentNumber: values.documentNumber,
      issueDate: values.issueDate,
      expiryDate: values.expiryDate,
      notes: values.notes,
      isPrimary: values.isPrimary ?? existing.isPrimary,
    },
    actorUserId: actor.id,
    capturedByCamera: false,
    cameraDeviceLabelSnapshot: null,
    auditKind: "replaced",
    replacedAttachment: existing,
    reason: values.reason,
  });

  return replacement;
}

export function saveCapturedPhoto(
  input: AttachmentCapturedPhotoRequest,
): AttachmentRecord {
  const values = attachmentCapturedPhotoRequestSchema.parse(input);
  const actor = requireAttachmentMutationPermission(values.entityType, "capturePhoto");
  ensureAttachmentEntityExists(values.entityType, values.entityId);
  const base64 = values.imageDataUrl.slice("data:image/jpeg;base64,".length);
  const bytes = Buffer.from(base64, "base64");

  validateAttachmentFileMetadata({
    mimeType: "image/jpeg",
    fileSize: bytes.length,
  });
  assertFileSignature(bytes, "image/jpeg");

  const storedFileName = `${crypto.randomUUID()}.jpg`;
  const relativePath = buildStoredRelativePath(
    values.entityType,
    values.entityId,
    "documents",
    storedFileName,
  );
  const destinationPath = resolveUserDataRelativePath(relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, bytes);

  return insertAttachmentRecord({
    values: {
      entityType: values.entityType,
      entityId: values.entityId,
      documentType: "customer_photo",
      title: null,
      documentNumber: null,
      issueDate: null,
      expiryDate: null,
      notes: values.notes ?? null,
      isPrimary: true,
    },
    originalFileName: "camera-capture.jpg",
    storedFileName,
    relativePath,
    mimeType: "image/jpeg",
    fileSize: bytes.length,
    sha256: sha256(bytes),
    actorUserId: actor.id,
    capturedByCamera: true,
    cameraDeviceLabelSnapshot: values.cameraDeviceLabelSnapshot ?? null,
    auditKind: "photoCaptured",
  });
}

export async function openAttachment(id: unknown): Promise<void> {
  const attachment = getAttachmentById(id);
  requireAttachmentViewPermission(attachment.entityType);
  const filePath = resolveAttachmentPath(attachment);

  if (!fs.existsSync(filePath)) {
    throw new Error("Attachment file was not found.");
  }

  await shell.openPath(filePath);
}

export function getAttachmentPreview(id: unknown): AttachmentPreview {
  const attachment = getAttachmentById(id);
  requireAttachmentViewPermission(attachment.entityType);
  const filePath = resolveAttachmentPath(attachment);
  const record = toAttachmentRecord(attachment);

  if (!record.mimeType.startsWith("image/") || !fs.existsSync(filePath)) {
    return { attachment: record, dataUrl: null };
  }

  const bytes = fs.readFileSync(filePath);
  return {
    attachment: record,
    dataUrl: `data:${record.mimeType};base64,${bytes.toString("base64")}`,
  };
}

export function archiveAttachment(input: AttachmentArchiveRequest): void {
  const values = attachmentArchiveRequestSchema.parse(input);
  const attachment = getAttachmentById(values.attachmentId);
  const actor = requireAttachmentMutationPermission(attachment.entityType, "archive");
  const now = new Date().toISOString();

  getDatabase().transaction((tx) => {
    tx.update(attachments)
      .set({
        isArchived: true,
        archivedAt: now,
        archivedByUserId: actor.id,
        archiveReason: values.reason,
        updatedAt: now,
      })
      .where(eq(attachments.id, attachment.id))
      .run();

    logDocumentAudit(tx, {
      actionKind: "archived",
      row: attachment,
      reason: values.reason,
    });

    recordAppEvent(tx, {
      eventType: "attachment_archived",
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      severity: "warning",
      message: "Attachment was archived.",
      details: { attachmentId: attachment.id, documentType: attachment.documentType },
    });
  });
}

function createAttachmentFromSourcePath({
  actorUserId,
  auditKind,
  cameraDeviceLabelSnapshot,
  capturedByCamera,
  reason,
  replacedAttachment,
  sourcePath,
  values,
}: {
  actorUserId: number;
  auditKind: "added" | "replaced";
  cameraDeviceLabelSnapshot: string | null;
  capturedByCamera: boolean;
  reason?: string;
  replacedAttachment?: AttachmentRow;
  sourcePath: string;
  values: AttachmentUploadRequest;
}): AttachmentRecord {
  const sourceStats = fs.statSync(sourcePath);
  if (!sourceStats.isFile()) {
    throw new Error("Selected document is not a file.");
  }

  const originalFileName = path.basename(sourcePath);
  const mimeType = getMimeTypeFromExtension(path.extname(originalFileName));
  validateAttachmentFileMetadata({ mimeType, fileSize: sourceStats.size });
  const bytes = fs.readFileSync(sourcePath);
  assertFileSignature(bytes, mimeType);
  const storedFileName = `${crypto.randomUUID()}${getExtensionForMimeType(mimeType)}`;
  const relativePath = buildStoredRelativePath(
    values.entityType,
    values.entityId,
    "documents",
    storedFileName,
  );
  const destinationPath = resolveUserDataRelativePath(relativePath);

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);

  return insertAttachmentRecord({
    values,
    originalFileName,
    storedFileName,
    relativePath,
    mimeType,
    fileSize: sourceStats.size,
    sha256: sha256(bytes),
    actorUserId,
    capturedByCamera,
    cameraDeviceLabelSnapshot,
    auditKind,
    replacedAttachment,
    reason,
  });
}

function insertAttachmentRecord({
  actorUserId,
  auditKind,
  cameraDeviceLabelSnapshot,
  capturedByCamera,
  fileSize,
  mimeType,
  originalFileName,
  reason,
  relativePath,
  replacedAttachment,
  sha256: hash,
  storedFileName,
  values,
}: {
  actorUserId: number;
  auditKind: "added" | "replaced" | "photoCaptured";
  cameraDeviceLabelSnapshot: string | null;
  capturedByCamera: boolean;
  fileSize: number;
  mimeType: AllowedAttachmentMimeType;
  originalFileName: string;
  reason?: string;
  relativePath: string;
  replacedAttachment?: AttachmentRow;
  sha256: string;
  storedFileName: string;
  values: AttachmentUploadRequest;
}): AttachmentRecord {
  const now = new Date().toISOString();
  const shouldBePrimary = values.isPrimary ?? isPhotoDocumentType(values.documentType);

  return getDatabase().transaction((tx) => {
    if (shouldBePrimary) {
      tx.update(attachments)
        .set({ isPrimary: false, updatedAt: now })
        .where(
          and(
            eq(attachments.entityType, values.entityType),
            eq(attachments.entityId, values.entityId),
            eq(attachments.documentType, values.documentType),
            eq(attachments.isArchived, false),
          ),
        )
        .run();
    }

    const inserted = tx
      .insert(attachments)
      .values({
        entityType: values.entityType,
        entityId: values.entityId,
        originalName: originalFileName,
        storedRelativePath: stripUploadsPrefix(relativePath),
        mimeType,
        sizeBytes: fileSize,
        attachmentType: values.documentType,
        documentType: values.documentType,
        title: values.title ?? null,
        originalFileName,
        storedFileName,
        relativePath,
        thumbnailRelativePath: null,
        fileSize,
        sha256: hash,
        documentNumber: values.documentNumber ?? null,
        issueDate: values.issueDate ?? null,
        expiryDate: values.expiryDate ?? null,
        notes: values.notes ?? null,
        capturedByCamera,
        cameraDeviceLabelSnapshot,
        isPrimary: shouldBePrimary,
        isArchived: false,
        archivedAt: null,
        archivedByUserId: null,
        archiveReason: null,
        createdAt: now,
        createdByUserId: actorUserId,
        updatedAt: now,
      })
      .returning()
      .get();

    if (replacedAttachment) {
      tx.update(attachments)
        .set({
          isArchived: true,
          archivedAt: now,
          archivedByUserId: actorUserId,
          archiveReason: reason ?? null,
          updatedAt: now,
        })
        .where(eq(attachments.id, replacedAttachment.id))
        .run();
    }

    logDocumentAudit(tx, {
      actionKind: auditKind,
      row: inserted,
      reason,
      replacedAttachmentId: replacedAttachment?.id,
    });

    recordAppEvent(tx, {
      eventType:
        auditKind === "photoCaptured"
          ? "attachment_photo_captured"
          : auditKind === "replaced"
            ? "attachment_replaced"
            : "attachment_added",
      entityType: values.entityType,
      entityId: values.entityId,
      message:
        auditKind === "replaced"
          ? "Attachment was replaced."
          : auditKind === "photoCaptured"
            ? "Photo was captured."
            : "Attachment was added.",
      details: {
        attachmentId: inserted.id,
        replacedAttachmentId: replacedAttachment?.id,
        documentType: inserted.documentType,
        mimeType,
        fileSize,
      },
    });

    return toAttachmentRecord(inserted);
  });
}

function requireAttachmentViewPermission(entityType: AttachmentEntityType): void {
  requirePermissionForCurrentSession(parentViewPermissionMap[entityType]);

  if (entityType === "customer" || entityType === "vehicle") {
    requirePermissionForCurrentSession(documentPermissionMap[entityType].view);
  }
}

function requireAttachmentMutationPermission(
  entityType: AttachmentEntityType,
  kind: AttachmentMutationKind,
) {
  requirePermissionForCurrentSession(parentViewPermissionMap[entityType]);

  if (entityType !== "customer" && entityType !== "vehicle") {
    throw new Error("Documents are only available for customers and vehicles.");
  }

  return requirePermissionForCurrentSession(documentPermissionMap[entityType][kind]);
}

function ensureAttachmentEntityExists(
  entityType: AttachmentEntityType,
  entityId: number,
): void {
  const db = getDatabase();
  const exists =
    entityType === "customer"
      ? db.select({ id: customers.id }).from(customers).where(eq(customers.id, entityId)).get()
      : entityType === "vehicle"
        ? db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, entityId)).get()
        : entityType === "rental"
          ? db.select({ id: rentals.id }).from(rentals).where(eq(rentals.id, entityId)).get()
          : db
              .select({ id: maintenanceRecords.id })
              .from(maintenanceRecords)
              .where(eq(maintenanceRecords.id, entityId))
              .get();

  if (!exists) {
    throw new Error("Attachment target was not found.");
  }
}

function getAttachmentById(id: unknown): AttachmentRow {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Attachment ID is invalid.");
  }

  const attachment = getDatabase()
    .select()
    .from(attachments)
    .where(eq(attachments.id, parsedId))
    .get();

  if (!attachment) {
    throw new Error("Attachment was not found.");
  }

  return attachment;
}

function resolveAttachmentPath(attachment: AttachmentRow): string {
  const relativePath = attachment.relativePath || `uploads/${attachment.storedRelativePath}`;
  return resolveUserDataRelativePath(relativePath);
}

function resolveUserDataRelativePath(relativePath: string): string {
  if (!isSafeStoredRelativePath(relativePath)) {
    throw new Error("Attachment path is unsafe.");
  }

  const userDataPath = getUserDataPath();
  const uploadsPath = path.join(userDataPath, "uploads");
  const resolved = path.resolve(userDataPath, relativePath);
  const relativeToUploads = path.relative(uploadsPath, resolved);

  if (relativeToUploads.startsWith("..") || path.isAbsolute(relativeToUploads)) {
    throw new Error("Attachment path is unsafe.");
  }

  return resolved;
}

function buildStoredRelativePath(
  entityType: AttachmentEntityType,
  entityId: number,
  folder: "documents" | "thumbnails",
  storedFileName: string,
): string {
  const entityFolder = entityType === "customer" ? "customers" : "vehicles";
  return `uploads/${entityFolder}/${entityId}/${folder}/${storedFileName}`;
}

function stripUploadsPrefix(relativePath: string): string {
  return relativePath.startsWith("uploads/") ? relativePath.slice("uploads/".length) : relativePath;
}

function getMimeTypeFromExtension(extension: string): AllowedAttachmentMimeType {
  const normalized = extension.toLowerCase();

  if (normalized === ".png") return "image/png";
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  if (normalized === ".webp") return "image/webp";
  if (normalized === ".pdf") return "application/pdf";

  throw new Error("File type is not supported.");
}

function getExtensionForMimeType(mimeType: AllowedAttachmentMimeType): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "application/pdf") return ".pdf";
  return ".jpg";
}

function assertFileSignature(bytes: Buffer, mimeType: AllowedAttachmentMimeType): void {
  if (mimeType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return;
  }

  if (
    mimeType === "image/png" &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return;
  }

  if (
    mimeType === "image/webp" &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return;
  }

  if (mimeType === "application/pdf" && bytes.subarray(0, 4).toString("ascii") === "%PDF") {
    return;
  }

  throw new Error("File contents do not match the selected file type.");
}

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function logDocumentAudit(
  tx: DbTransaction,
  input: {
    actionKind: "added" | "replaced" | "archived" | "photoCaptured";
    row: AttachmentRow;
    reason?: string;
    replacedAttachmentId?: number;
  },
): void {
  const record = toAttachmentRecord(input.row);
  const targetLabel = getTargetEntityLabel(tx, record.entityType, record.entityId);
  const action = getAuditAction(record.entityType, record.documentType, input.actionKind);

  logAuditEvent(tx, {
    action,
    entityType: record.entityType,
    entityId: record.entityId,
    entityLabel: targetLabel,
    summaryAr: getAuditSummary(record.entityType, record.documentType, input.actionKind, targetLabel, "ar"),
    summaryEn: getAuditSummary(record.entityType, record.documentType, input.actionKind, targetLabel, "en"),
    metadata: {
      attachmentId: record.id,
      replacedAttachmentId: input.replacedAttachmentId,
      documentType: record.documentType,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      capturedByCamera: record.capturedByCamera,
    },
    reason: input.reason,
  });
}

function getAuditAction(
  entityType: AttachmentEntityType,
  documentType: AttachmentDocumentType,
  actionKind: "added" | "replaced" | "archived" | "photoCaptured",
): string {
  if (entityType === "customer") {
    if (actionKind === "photoCaptured") return "customer.photo.captured";
    if (actionKind === "replaced") return "customer.document.replaced";
    if (actionKind === "archived") return "customer.document.archived";
    return "customer.document.added";
  }

  if (entityType === "vehicle") {
    if (documentType === "vehicle_photo" && actionKind === "added") {
      return "vehicle.photo.added";
    }
    if (actionKind === "replaced") return "vehicle.document.replaced";
    if (actionKind === "archived") return "vehicle.document.archived";
    return "vehicle.document.added";
  }

  return `attachment.${actionKind}`;
}

function getAuditSummary(
  entityType: AttachmentEntityType,
  documentType: AttachmentDocumentType,
  actionKind: "added" | "replaced" | "archived" | "photoCaptured",
  targetLabel: string,
  language: "ar" | "en",
): string {
  void documentType;

  if (language === "ar") {
    if (actionKind === "photoCaptured") return `تم التقاط صورة للعميل ${targetLabel}`;
    if (actionKind === "replaced") return `تم استبدال وثيقة في ${targetLabel}`;
    if (actionKind === "archived") return `تمت أرشفة وثيقة في ${targetLabel}`;
    return entityType === "vehicle"
      ? `تمت إضافة وثيقة للمركبة ${targetLabel}`
      : `تمت إضافة وثيقة للعميل ${targetLabel}`;
  }

  if (actionKind === "photoCaptured") return `A customer photo was captured for ${targetLabel}.`;
  if (actionKind === "replaced") return `A document was replaced for ${targetLabel}.`;
  if (actionKind === "archived") return `A document was archived for ${targetLabel}.`;
  return entityType === "vehicle"
    ? `A vehicle document was added for ${targetLabel}.`
    : `A customer document was added for ${targetLabel}.`;
}

function getTargetEntityLabel(
  tx: DbTransaction,
  entityType: AttachmentEntityType,
  entityId: number,
): string {
  if (entityType === "customer") {
    return (
      tx.select({ label: customers.fullName })
        .from(customers)
        .where(eq(customers.id, entityId))
        .get()?.label ?? `#${entityId}`
    );
  }

  if (entityType === "vehicle") {
    return (
      tx.select({ label: vehicles.plateNumber })
        .from(vehicles)
        .where(eq(vehicles.id, entityId))
        .get()?.label ?? `#${entityId}`
    );
  }

  return `#${entityId}`;
}

function toAttachmentRecord(row: AttachmentRow): AttachmentRecord {
  const documentType = normalizeDocumentType(row.entityType, row.documentType || row.attachmentType);
  const relativePath = row.relativePath || `uploads/${row.storedRelativePath}`;
  const mimeType = isAllowedAttachmentMimeType(row.mimeType)
    ? row.mimeType
    : "application/pdf";

  return {
    id: row.id,
    entityType: row.entityType as AttachmentEntityType,
    entityId: row.entityId,
    documentType,
    title: row.title,
    originalFileName: row.originalFileName || row.originalName,
    storedFileName: row.storedFileName || path.basename(relativePath),
    relativePath,
    thumbnailRelativePath: row.thumbnailRelativePath,
    mimeType,
    fileSize: row.fileSize || row.sizeBytes,
    sha256: row.sha256,
    documentNumber: row.documentNumber,
    issueDate: row.issueDate,
    expiryDate: row.expiryDate,
    notes: row.notes,
    capturedByCamera: row.capturedByCamera,
    cameraDeviceLabelSnapshot: row.cameraDeviceLabelSnapshot,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    createdByUserName: getCreatedByUserName(row.createdByUserId),
    updatedAt: row.updatedAt || row.createdAt,
    archivedAt: row.archivedAt,
    archivedByUserId: row.archivedByUserId,
    archiveReason: row.archiveReason,
  };
}

function getCreatedByUserName(userId: number | null): string | null {
  if (!userId) {
    return null;
  }

  return (
    getDatabase()
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .get()?.fullName ?? null
  );
}

function normalizeDocumentType(
  entityType: AttachmentEntityType,
  documentType: string,
): AttachmentDocumentType {
  if (entityType === "customer") {
    if (
      documentType === "customer_photo" ||
      documentType === "passport" ||
      documentType === "national_id" ||
      documentType === "driver_license" ||
      documentType === "driver_license_front" ||
      documentType === "driver_license_back"
    ) {
      return documentType;
    }
    return "other";
  }

  if (entityType === "vehicle") {
    if (
      documentType === "vehicle_photo" ||
      documentType === "vehicle_booklet" ||
      documentType === "insurance" ||
      documentType === "registration" ||
      documentType === "inspection"
    ) {
      return documentType;
    }
    return "other";
  }

  return "other";
}
