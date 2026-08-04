import { ExternalLink, FileText, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/useI18n";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import {
  attachmentDocumentLabelKeys,
  formatAttachmentFileSize,
  type AttachmentPreview,
  type AttachmentRecord,
} from "@/shared/attachments";

type DocumentViewerDialogProps = {
  attachment: AttachmentRecord | null;
  open: boolean;
  onClose: () => void;
};

export function DocumentViewerDialog({
  attachment,
  onClose,
  open,
}: DocumentViewerDialogProps) {
  const { formatDate, language, t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  useModalBehavior({
    containerRef: dialogRef,
    onClose,
    open: open && Boolean(attachment),
  });

  useEffect(() => {
    if (!open || !attachment) {
      window.queueMicrotask(() => {
        setPreview(null);
        setError(null);
      });
      return;
    }

    let cancelled = false;
    window.queueMicrotask(() => {
      setIsLoading(true);
      setError(null);
    });
    window.rentalApp.attachments
      .getPreview(attachment.id)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("Document could not be loaded."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, open, t]);

  if (!open || !attachment) {
    return null;
  }

  const active = preview?.attachment ?? attachment;
  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <section
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b bg-muted px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-normal" id={titleId}>
              {t("Document Viewer")}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <bdi dir="auto">{active.originalFileName}</bdi>
            </p>
          </div>
          <Button aria-label={t("Close")} size="icon" type="button" variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-h-[18rem] items-center justify-center rounded-lg border bg-muted/40 p-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("Loading...")}
              </div>
            ) : preview?.dataUrl ? (
              <img
                alt={active.title ?? active.originalFileName}
                className="max-h-[58dvh] max-w-full rounded-md object-contain"
                src={preview.dataUrl}
              />
            ) : (
              <div className="max-w-sm text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-3 size-10 text-primary" />
                <p className="font-medium text-foreground">{t("Preview unavailable")}</p>
                <p className="mt-1">{t("Open the file with the default Windows app.")}</p>
              </div>
            )}
          </div>

          <aside className="rounded-lg border bg-card p-4 text-sm">
            {error ? (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                {t(error)}
              </div>
            ) : null}
            <div className="flex flex-col gap-3">
              <DetailRow label={t("Document Type")} value={<BidiInline>{t(attachmentDocumentLabelKeys[active.documentType])}</BidiInline>} />
              <DetailRow label={t("File Name")} value={<BidiInline>{active.originalFileName}</BidiInline>} />
              {active.documentNumber ? (
                <DetailRow label={t("Document Number")} value={<BidiValue value={active.documentNumber} wrap />} />
              ) : null}
              {active.issueDate ? (
                <DetailRow label={t("Issue Date")} value={<BidiValue value={formatDate(active.issueDate)} />} />
              ) : null}
              {active.expiryDate ? (
                <DetailRow label={t("Expiry Date")} value={<BidiValue value={formatDate(active.expiryDate)} />} />
              ) : null}
              <DetailRow
                label={t("File Size")}
                value={<BidiInline>{formatAttachmentFileSize(active.fileSize, language)}</BidiInline>}
              />
              <DetailRow label={t("Added")} value={<BidiValue value={formatDate(active.createdAt)} />} />
              {active.createdByUserName ? (
                <DetailRow label={t("Uploaded by")} value={<BidiInline>{active.createdByUserName}</BidiInline>} />
              ) : null}
              {active.capturedByCamera ? (
                <Badge variant="info">{t("Captured by camera")}</Badge>
              ) : null}
              {active.notes ? (
                <DetailRow label={t("Notes")} value={<span dir="auto">{active.notes}</span>} />
              ) : null}
            </div>
            <Button
              className="mt-5 w-full"
              type="button"
              variant="outline"
              onClick={() => void window.rentalApp.attachments.open(active.id)}
            >
              <ExternalLink />
              {t("Open File")}
            </Button>
          </aside>
        </div>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 break-words font-medium">{value}</div>
    </div>
  );
}

function BidiInline({ children }: { children: ReactNode }) {
  return <bdi dir="auto">{children}</bdi>;
}
