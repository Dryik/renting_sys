export type DataHealthIssueType =
  | "vehicle_rented_without_open_rental"
  | "open_rental_vehicle_not_rented"
  | "returned_rental_vehicle_still_rented"
  | "negative_remaining_balance"
  | "maintenance_without_record"
  | "open_maintenance_vehicle_not_maintenance";

export type DataHealthIssue = {
  id: string;
  type: DataHealthIssueType;
  severity: "warning" | "danger";
  title: string;
  detail: string;
  entityType: "vehicle" | "rental";
  entityId: number;
  canAutoFix: boolean;
};

export type DataHealthFixRequest = {
  issueId: string;
};
