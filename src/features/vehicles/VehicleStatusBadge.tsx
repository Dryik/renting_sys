import { StatusBadge } from "@/components/ui/status-badge";
import { useI18n } from "@/hooks/useI18n";
import {
  formatVehicleStatus,
  type VehicleDisplayStatus,
} from "@/shared/vehicles";

type VehicleStatusBadgeProps = {
  status: VehicleDisplayStatus;
};

const statusTone: Record<
  VehicleDisplayStatus,
  "success" | "warning" | "neutral" | "default"
> = {
  available: "success",
  rented: "default",
  maintenance: "warning",
  inactive: "neutral",
  sold: "neutral",
};

export function VehicleStatusBadge({ status }: VehicleStatusBadgeProps) {
  const { language } = useI18n();

  return (
    <StatusBadge tone={statusTone[status]}>
      {formatVehicleStatus(status, language)}
    </StatusBadge>
  );
}
