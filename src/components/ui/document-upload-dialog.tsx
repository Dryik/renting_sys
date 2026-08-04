import { FileUp, Loader2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import {
  attachmentDocumentLabelKeys,
  getDocumentTypesForEntity,
  isPhotoDocumentType,
  type AttachmentDocumentType,
  type AttachmentEntityType,
  type AttachmentRecord,
  type AttachmentUploadRequest,
} from "@/shared/attachments";

type DocumentUploadDialogProps = {
  entityType: Extract<AttachmentEntityType, "customer" | "vehicle">;
  entityId: number;
  isBusy?: boolean;
  mode?: "upload" | "replace";
  open: boolean;
  replaceTarget?: AttachmentRecord | null;
  onCancel: () => void;
  onSubmit: (request: AttachmentUploadRequest, reason?: string) => void;
};

export function DocumentUploadDialog({
  entityId,
  entityType,
  isBusy = false,
  mode = "upload",
  onCancel,
  onSubmit,
  open,
  replaceTarget = null,
}: DocumentUploadDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const documentTypes = useMemo(() => getDocumentTypesForEntity(entityType), [entityType]);
  const [documentType, setDocumentType] = useState<AttachmentDocumentType>(
    replaceTarget?.documentType ?? documentTypes[0] ?? "other",
  );
  const [title, setTitle] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    window.queueMicrotask(() => {
      setDocumentType(replaceTarget?.documentType ?? documentTypes[0] ?? "other");
      setTitle(replaceTarget?.title ?? "");
      setDocumentNumber(replaceTarget?.documentNumber ?? "");
      setIssueDate(replaceTarget?.issueDate ?? "");
      setExpiryDate(replaceTarget?.expiryDate ?? "");
      setNotes(replaceTarget?.notes ?? "");
      setReason("");
    });
  }, [documentTypes, open, replaceTarget]);

  if (!open) {
    return null;
  }

  const isReplace = mode === "replace";
  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <section
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b bg-muted px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-normal" id={titleId}>
              {t(isReplace ? "Replace Document" : "Upload Document")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground" id={descriptionId}>
              {t("Choose the document type and then select the local file.")}
            </p>
          </div>
          <Button
            aria-label={t("Close")}
            disabled={isBusy}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            <X />
          </Button>
        </header>

        <div className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Document Type")}</span>
              <select
                className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as AttachmentDocumentType)}
              >
                {documentTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(attachmentDocumentLabelKeys[type])}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Title")} <span className="text-muted-foreground">{t("Optional")}</span></span>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Document Number")}</span>
              <Input
                data-ltr="true"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Issue Date")}</span>
              <Input
                data-ltr="true"
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Expiry Date")}</span>
              <Input
                data-ltr="true"
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </label>

            {isReplace ? (
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>{t("Reason")}</span>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
            ) : null}
          </div>

          <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
            <span>{t("Notes")} <span className="text-muted-foreground">{t("Optional")}</span></span>
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <div className="mt-4 rounded-lg border bg-muted/35 p-4 text-sm">
            <div className="flex items-start gap-3">
              <FileUp className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="space-y-1 text-muted-foreground">
                <p className="font-medium text-foreground">{t("Choose/upload file")}</p>
                <p>{t("Supported files: PDF, JPG, PNG, WebP")}</p>
                <p>{t("Max size: 20 MB for documents, 10 MB for images")}</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t bg-muted px-5 py-4">
          <Button disabled={isBusy} type="button" variant="outline" onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={isBusy || (isReplace && reason.trim().length === 0)}
            type="button"
            onClick={() => {
              onSubmit(
                {
                  entityType,
                  entityId,
                  documentType,
                  title: title.trim() || null,
                  documentNumber: documentNumber.trim() || null,
                  issueDate: issueDate || null,
                  expiryDate: expiryDate || null,
                  notes: notes.trim() || null,
                  isPrimary: isPhotoDocumentType(documentType),
                },
                reason.trim() || undefined,
              );
            }}
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <FileUp />}
            {t(isReplace ? "Replace" : "Upload from device")}
          </Button>
        </footer>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}
