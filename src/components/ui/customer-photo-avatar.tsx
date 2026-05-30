import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  isPhotoDocumentType,
  type AttachmentRecord,
} from "@/shared/attachments";

type CustomerPhotoAvatarProps = {
  alt: string;
  className?: string;
  customerId: number;
  iconClassName?: string;
};

export function CustomerPhotoAvatar({
  alt,
  className,
  customerId,
  iconClassName,
}: CustomerPhotoAvatarProps) {
  const { can } = useAuth();
  const canViewDocuments = can("customers.documents.view");
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewDocuments) {
      window.queueMicrotask(() => {
        setDataUrl(null);
      });
      return;
    }

    let cancelled = false;

    async function loadPhoto() {
      try {
        const result = await window.rentalApp.attachments.list({
          entityType: "customer",
          entityId: customerId,
          pageSize: 100,
        });
        const photo = findPrimaryCustomerPhoto(result.rows);

        if (!photo) {
          if (!cancelled) setDataUrl(null);
          return;
        }

        const preview = await window.rentalApp.attachments.getPreview(photo.id);
        if (!cancelled) setDataUrl(preview.dataUrl);
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    }

    void loadPhoto();

    return () => {
      cancelled = true;
    };
  }, [canViewDocuments, customerId]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent text-primary",
        className,
      )}
    >
      {dataUrl ? (
        <img alt={alt} className="h-full w-full object-cover" src={dataUrl} />
      ) : (
        <UserRound className={cn("size-5", iconClassName)} />
      )}
    </div>
  );
}

function findPrimaryCustomerPhoto(rows: AttachmentRecord[]): AttachmentRecord | null {
  return (
    rows.find((attachment) => attachment.isPrimary && isPhotoDocumentType(attachment.documentType)) ??
    rows.find((attachment) => isPhotoDocumentType(attachment.documentType)) ??
    null
  );
}
