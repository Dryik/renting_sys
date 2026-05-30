import { describe, expect, it } from "vitest";
import {
  attachmentCapturedPhotoRequestSchema,
  attachmentUploadRequestSchema,
  formatAttachmentFileSize,
  getMaxAttachmentFileSize,
  isAttachmentDocumentTypeAllowed,
  isSafeStoredRelativePath,
  validateAttachmentFileMetadata,
} from "./attachments";

describe("attachment document validation", () => {
  it("allows only the expected customer and vehicle document types", () => {
    expect(isAttachmentDocumentTypeAllowed("customer", "customer_photo")).toBe(true);
    expect(isAttachmentDocumentTypeAllowed("customer", "passport")).toBe(true);
    expect(isAttachmentDocumentTypeAllowed("customer", "vehicle_booklet")).toBe(false);
    expect(isAttachmentDocumentTypeAllowed("vehicle", "vehicle_booklet")).toBe(true);
    expect(isAttachmentDocumentTypeAllowed("vehicle", "customer_photo")).toBe(false);
  });

  it("validates metadata by target entity", () => {
    expect(
      attachmentUploadRequestSchema.parse({
        entityType: "vehicle",
        entityId: 1,
        documentType: "vehicle_booklet",
        title: "",
        documentNumber: "",
        issueDate: "",
        expiryDate: "2026-12-31",
        notes: "",
      }),
    ).toMatchObject({
      entityType: "vehicle",
      entityId: 1,
      documentType: "vehicle_booklet",
      title: null,
      documentNumber: null,
      issueDate: null,
      expiryDate: "2026-12-31",
      notes: null,
    });

    expect(() =>
      attachmentUploadRequestSchema.parse({
        entityType: "customer",
        entityId: 1,
        documentType: "insurance",
      }),
    ).toThrow("Document type is not allowed for this record.");
  });

  it("enforces MIME type and size limits", () => {
    expect(getMaxAttachmentFileSize("image/jpeg")).toBe(10 * 1024 * 1024);
    expect(getMaxAttachmentFileSize("application/pdf")).toBe(20 * 1024 * 1024);
    expect(() =>
      validateAttachmentFileMetadata({
        mimeType: "image/png",
        fileSize: 10 * 1024 * 1024 + 1,
      }),
    ).toThrow("Images must be 10 MB or smaller.");
    expect(() =>
      validateAttachmentFileMetadata({
        mimeType: "application/pdf",
        fileSize: 20 * 1024 * 1024 + 1,
      }),
    ).toThrow("PDF documents must be 20 MB or smaller.");
  });

  it("formats file sizes with number before unit in both languages", () => {
    expect(formatAttachmentFileSize(2 * 1024, "en")).toBe("2 KB");
    expect(formatAttachmentFileSize(2 * 1024, "ar")).toBe("2 كيلوبايت");
    expect(formatAttachmentFileSize(2.5 * 1024 * 1024, "en")).toBe("2.5 MB");
    expect(formatAttachmentFileSize(2.5 * 1024 * 1024, "ar")).toBe("2.5 ميغابايت");
  });

  it("rejects unsafe stored paths", () => {
    expect(isSafeStoredRelativePath("uploads/customers/1/documents/file.jpg")).toBe(true);
    expect(isSafeStoredRelativePath("../uploads/customers/1/file.jpg")).toBe(false);
    expect(isSafeStoredRelativePath("C:/temp/file.jpg")).toBe(false);
    expect(isSafeStoredRelativePath("/uploads/customers/1/file.jpg")).toBe(false);
    expect(isSafeStoredRelativePath("customers/1/file.jpg")).toBe(false);
  });

  it("accepts only JPEG camera captures for customers", () => {
    expect(
      attachmentCapturedPhotoRequestSchema.parse({
        entityType: "customer",
        entityId: 2,
        imageDataUrl: "data:image/jpeg;base64,/9j/4AAQ",
        cameraDeviceLabelSnapshot: "USB Camera",
      }).cameraDeviceLabelSnapshot,
    ).toBe("USB Camera");

    expect(() =>
      attachmentCapturedPhotoRequestSchema.parse({
        entityType: "customer",
        entityId: 2,
        imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      }),
    ).toThrow("Captured photo must be a JPEG image.");
  });
});
