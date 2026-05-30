import {
  Camera,
  Eye,
  FileText,
  Image,
  Loader2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { CameraCaptureDialog } from "@/components/ui/camera-capture-dialog";
import { DocumentUploadDialog } from "@/components/ui/document-upload-dialog";
import { DocumentViewerDialog } from "@/components/ui/document-viewer-dialog";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import {
  attachmentDocumentLabelKeys,
  formatAttachmentFileSize,
  isPhotoDocumentType,
  type AttachmentEntityType,
  type AttachmentRecord,
  type AttachmentReplaceRequest,
  type AttachmentUploadRequest,
} from "@/shared/attachments";
import type { Permission } from "@/shared/auth";

type DocumentPhotoSectionProps = {
  entityType: Extract<AttachmentEntityType, "customer" | "vehicle">;
  entityId: number;
};

const documentPermissions: Record<
  Extract<AttachmentEntityType, "customer" | "vehicle">,
  {
    archive: Permission;
    create: Permission;
    replace: Permission;
    view: Permission;
    capturePhoto?: Permission;
  }
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
  },
};

export function DocumentPhotoSection({ entityId, entityType }: DocumentPhotoSectionProps) {
  const { can } = useAuth();
  const { formatDate, language, t } = useI18n();
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewerAttachment, setViewerAttachment] = useState<AttachmentRecord | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<AttachmentRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AttachmentRecord | null>(null);
  const permissions = documentPermissions[entityType];
  const canView = can(permissions.view);
  const canCreate = can(permissions.create);
  const canReplace = can(permissions.replace);
  const canArchive = can(permissions.archive);
  const canCapturePhoto = entityType === "customer" && permissions.capturePhoto
    ? can(permissions.capturePhoto)
    : false;

  const primaryPhoto = useMemo(
    () =>
      attachments.find((attachment) => attachment.isPrimary && isPhotoDocumentType(attachment.documentType)) ??
      attachments.find((attachment) => isPhotoDocumentType(attachment.documentType)) ??
      null,
    [attachments],
  );
  const nonPhotoAttachments = useMemo(
    () => attachments.filter((attachment) => !isPhotoDocumentType(attachment.documentType)),
    [attachments],
  );

  const loadAttachments = useCallback(async () => {
    if (!canView) {
      setAttachments([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await window.rentalApp.attachments.list({
        entityType,
        entityId,
        pageSize: 100,
      });
      setAttachments(result.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Documents could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [canView, entityId, entityType, t]);

  useEffect(() => {
    window.queueMicrotask(() => {
      void loadAttachments();
    });
  }, [loadAttachments]);

  async function uploadDocument(request: AttachmentUploadRequest) {
    setIsSaving(true);
    setError(null);

    try {
      await window.rentalApp.attachments.upload(request);
      setUploadOpen(false);
      await loadAttachments();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Document could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function replaceDocument(request: AttachmentUploadRequest, reason?: string) {
    if (!replaceTarget || !reason) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload: AttachmentReplaceRequest = {
      ...request,
      attachmentId: replaceTarget.id,
      reason,
    };

    try {
      await window.rentalApp.attachments.replace(payload);
      setReplaceTarget(null);
      await loadAttachments();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Document could not be replaced."));
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveDocument(reason: string) {
    if (!archiveTarget) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await window.rentalApp.attachments.archive({
        attachmentId: archiveTarget.id,
        reason,
      });
      setArchiveTarget(null);
      await loadAttachments();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Document could not be deleted."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-5 rounded-lg border bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold">
            <FileText className="size-4" />
            {t("Documents & Photos")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {entityType === "customer"
              ? t("Customer documents stay stored locally on this computer.")
              : t("Vehicle documents stay stored locally on this computer.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate ? (
            <Button size="sm" type="button" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload />
              {t("Upload Document")}
            </Button>
          ) : null}
          {canCapturePhoto ? (
            <Button size="sm" type="button" onClick={() => setCameraOpen(true)}>
              <Camera />
              {t("Take Photo")}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      {!canView ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t("Permission denied")}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("Loading...")}
        </div>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">
              {entityType === "customer" ? t("Customer Photo") : t("Vehicle Photo")}
            </p>
            <button
              className="mt-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground"
              type="button"
              onClick={() => primaryPhoto && setViewerAttachment(primaryPhoto)}
            >
              {primaryPhoto ? (
                <PhotoPreview attachment={primaryPhoto} />
              ) : (
                <div className="text-center text-sm">
                  <Image className="mx-auto mb-2 size-8" />
                  {t("No photo added yet")}
                </div>
              )}
            </button>
            {primaryPhoto ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" type="button" variant="outline" onClick={() => setViewerAttachment(primaryPhoto)}>
                  <Eye />
                  {t("View")}
                </Button>
                {canReplace ? (
                  <Button size="sm" type="button" variant="ghost" onClick={() => setReplaceTarget(primaryPhoto)}>
                    <Pencil />
                    {t("Replace")}
                  </Button>
                ) : null}
                {canArchive ? (
                  <Button size="sm" type="button" variant="ghost" onClick={() => setArchiveTarget(primaryPhoto)}>
                    <Trash2 />
                    {t("Delete")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="divide-y rounded-lg border bg-card">
            {nonPhotoAttachments.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-3 size-8 text-primary" />
                <p className="font-medium text-foreground">
                  {entityType === "customer" && primaryPhoto
                    ? t("No identity documents added yet.")
                    : t("No documents added yet")}
                </p>
                <p className="mt-1">
                  {entityType === "customer"
                    ? t("Add passport, national ID, driver license, or other documents here.")
                    : t("Add vehicle booklet, insurance, registration, inspection, or other documents here.")}
                </p>
              </div>
            ) : (
              nonPhotoAttachments.map((attachment) => (
                <DocumentRow
                  key={attachment.id}
                  attachment={attachment}
                  canArchive={canArchive}
                  canReplace={canReplace}
                  formatDate={formatDate}
                  language={language}
                  t={t}
                  onArchive={() => setArchiveTarget(attachment)}
                  onReplace={() => setReplaceTarget(attachment)}
                  onView={() => setViewerAttachment(attachment)}
                />
              ))
            )}
          </div>
        </div>
      )}

      <DocumentUploadDialog
        entityId={entityId}
        entityType={entityType}
        isBusy={isSaving}
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onSubmit={(request) => void uploadDocument(request)}
      />
      <DocumentUploadDialog
        entityId={entityId}
        entityType={entityType}
        isBusy={isSaving}
        mode="replace"
        open={Boolean(replaceTarget)}
        replaceTarget={replaceTarget}
        onCancel={() => setReplaceTarget(null)}
        onSubmit={(request, reason) => void replaceDocument(request, reason)}
      />
      <DocumentViewerDialog
        attachment={viewerAttachment}
        open={Boolean(viewerAttachment)}
        onClose={() => setViewerAttachment(null)}
      />
      {entityType === "customer" ? (
        <CameraCaptureDialog
          customerId={entityId}
          isBusy={isSaving}
          open={cameraOpen}
          onCancel={() => setCameraOpen(false)}
          onFallbackUpload={() => {
            setCameraOpen(false);
            setUploadOpen(true);
          }}
          onSaved={() => {
            setCameraOpen(false);
            void loadAttachments();
          }}
        />
      ) : null}
      <ReasonDialog
        cancelLabel={t("Cancel")}
        confirmLabel={t("Delete")}
        description={t("This document will be hidden from the active list but kept in the record.")}
        isBusy={isSaving}
        open={Boolean(archiveTarget)}
        reasonLabel={t("Reason")}
        title={t("Delete document?")}
        variant="destructive"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={(reason) => void archiveDocument(reason)}
      />
    </section>
  );
}

function DocumentRow({
  attachment,
  canArchive,
  canReplace,
  formatDate,
  language,
  onArchive,
  onReplace,
  onView,
  t,
}: {
  attachment: AttachmentRecord;
  canArchive: boolean;
  canReplace: boolean;
  formatDate: (value: string | Date) => string;
  language: "ar" | "en";
  onArchive: () => void;
  onReplace: () => void;
  onView: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={attachment.documentType === "vehicle_booklet" ? "info" : "secondary"}>
            {t(attachmentDocumentLabelKeys[attachment.documentType])}
          </Badge>
          {attachment.capturedByCamera ? (
            <Badge variant="success">{t("Captured by camera")}</Badge>
          ) : null}
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate font-medium">
            <bdi dir="auto">{attachment.title || attachment.originalFileName}</bdi>
          </p>
          {attachment.title ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <bdi dir="auto">{attachment.originalFileName}</bdi>
            </p>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {attachment.documentNumber ? (
            <span>
              {t("Document Number")}: <BidiValue value={attachment.documentNumber} />
            </span>
          ) : null}
          {attachment.expiryDate ? (
            <span>
              {t("Expiry Date")}: <BidiValue value={formatDate(attachment.expiryDate)} />
            </span>
          ) : null}
          <span>
            {t("Added")} <BidiValue value={formatDate(attachment.createdAt)} />
          </span>
          <span>
            {t("File Size")}: <bdi dir="auto">{formatAttachmentFileSize(attachment.fileSize, language)}</bdi>
          </span>
          {attachment.createdByUserName ? (
            <span>
              {t("Uploaded by")}: <bdi dir="auto">{attachment.createdByUserName}</bdi>
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" type="button" variant="outline" onClick={onView}>
          <Eye />
          {t("View")}
        </Button>
        {canReplace ? (
          <Button size="sm" type="button" variant="ghost" onClick={onReplace}>
            <Pencil />
            {t("Replace")}
          </Button>
        ) : null}
        {canArchive ? (
          <Button size="sm" type="button" variant="ghost" onClick={onArchive}>
            <Trash2 />
            {t("Delete")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PhotoPreview({ attachment }: { attachment: AttachmentRecord }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.rentalApp.attachments
      .getPreview(attachment.id)
      .then((preview) => {
        if (!cancelled) setDataUrl(preview.dataUrl);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.id]);

  if (!dataUrl) {
    return <Image className="size-8" />;
  }

  return (
    <img
      alt={attachment.title ?? attachment.originalFileName}
      className="h-full w-full object-cover"
      src={dataUrl}
    />
  );
}
