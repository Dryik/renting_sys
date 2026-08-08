import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  isPhotoDocumentType,
  type AttachmentRecord,
} from "@/shared/attachments";
import { useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";

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
  /**
   * Keyed to the session and to this customer, so saving a photo — which
   * invalidates the business root — refreshes the avatar along with every other
   * attachment reader. The old effect was outside the cache entirely, which is
   * why an avatar could stay stale after a capture.
   *
   * Gated on the view permission exactly as before: without it, no request.
   */
  const listRequest = { entityType: "customer" as const, entityId: customerId, pageSize: 100 };
  const photoQuery = useBusinessQuery(
    "attachments",
    "customerPhoto",
    listRequest,
    async () => {
      const result = await rentalAppApi.attachments.list(listRequest);
      const photo = findPrimaryCustomerPhoto(result.rows);

      if (!photo) {
        return null;
      }

      const preview = await rentalAppApi.attachments.getPreview(photo.id);

      return preview.dataUrl;
    },
    { enabled: canViewDocuments },
  );
  const dataUrl = canViewDocuments ? photoQuery.data ?? null : null;

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
