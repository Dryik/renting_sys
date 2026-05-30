import { DocumentPhotoSection } from "@/components/ui/document-photo-section";
import type { AttachmentEntityType } from "@/shared/attachments";

type AttachmentListProps = {
  entityType: AttachmentEntityType;
  entityId: number;
};

export function AttachmentList({ entityId, entityType }: AttachmentListProps) {
  if (entityType !== "customer" && entityType !== "vehicle") {
    return null;
  }

  return <DocumentPhotoSection entityType={entityType} entityId={entityId} />;
}
