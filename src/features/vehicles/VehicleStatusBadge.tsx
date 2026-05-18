import { Badge } from "@/components/ui/badge";
import {
  formatVehicleStatus,
  type VehicleRecord,
} from "@/shared/vehicles";

type VehicleStatusBadgeProps = {
  status: VehicleRecord["status"];
};

const statusVariant: Record<
  VehicleRecord["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  available: "default",
  rented: "secondary",
  maintenance: "outline",
  inactive: "secondary",
};

export function VehicleStatusBadge({ status }: VehicleStatusBadgeProps) {
  return (
    <Badge variant={statusVariant[status]}>{formatVehicleStatus(status)}</Badge>
  );
}
