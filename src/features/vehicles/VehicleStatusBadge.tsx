import { StatusBadge } from "@/components/ui/status-badge";
import { useI18n } from "@/hooks/useI18n";
import {
  formatVehicleStatus,
  type VehicleRecord,
} from "@/shared/vehicles";

type VehicleStatusBadgeProps = {
  status: VehicleRecord["status"];
};

const statusTone: Record<
  VehicleRecord["status"],
  "success" | "warning" | "neutral" | "default"
> = {
  available: "success",
  rented: "default",
  maintenance: "warning",
  inactive: "neutral",
};

export function VehicleStatusBadge({ status }: VehicleStatusBadgeProps) {
  const { language } = useI18n();

  return (
    <StatusBadge tone={statusTone[status]}>
      {formatVehicleStatus(status, language)}
    </StatusBadge>
  );
}
