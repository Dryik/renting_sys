import { StatusBadge } from "@/components/ui/status-badge";
import { useI18n } from "@/hooks/useI18n";
import {
  formatRentalStatus,
  type RentalListRecord,
} from "@/shared/rentals";

type RentalStatusBadgeProps = {
  status: RentalListRecord["status"];
};

const statusTone: Record<
  RentalListRecord["status"],
  "success" | "warning" | "danger" | "neutral" | "default"
> = {
  draft: "neutral",
  active: "default",
  returned: "success",
  cancelled: "neutral",
  overdue: "danger",
};

export function RentalStatusBadge({ status }: RentalStatusBadgeProps) {
  const { language } = useI18n();

  return (
    <StatusBadge tone={statusTone[status]}>
      {formatRentalStatus(status, language)}
    </StatusBadge>
  );
}
