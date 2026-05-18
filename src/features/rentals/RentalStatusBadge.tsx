import { Badge } from "@/components/ui/badge";
import {
  formatRentalStatus,
  type RentalListRecord,
} from "@/shared/rentals";

type RentalStatusBadgeProps = {
  status: RentalListRecord["status"];
};

const statusVariant: Record<
  RentalListRecord["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  active: "default",
  returned: "secondary",
  cancelled: "outline",
  overdue: "destructive",
};

export function RentalStatusBadge({ status }: RentalStatusBadgeProps) {
  return (
    <Badge variant={statusVariant[status]}>{formatRentalStatus(status)}</Badge>
  );
}
