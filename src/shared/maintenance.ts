import { z } from "zod";
import type { PageRequest } from "./pagination";

export const maintenanceRecordSchema = z.object({
  vehicleId: z.string().trim().min(1, "Vehicle is required."),
  title: z.string().trim().min(1, "Title/Service name is required.").max(100),
  description: z.string().trim().max(1000, "Description cannot exceed 1000 characters."),
  cost: z
    .string()
    .trim()
    .min(1, "Cost is required.")
    .refine((val) => {
      const num = Number(val);
      return !Number.isNaN(num) && num >= 0;
    }, "Cost must be a positive number or zero."),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string(),
});

export type MaintenanceFormValues = z.infer<typeof maintenanceRecordSchema>;

export type MaintenanceListState = "all" | "ongoing" | "completed";

export type MaintenanceListRequest = PageRequest & {
  state?: MaintenanceListState;
};

export type MaintenanceInput = {
  vehicleId: number;
  title: string;
  description: string | null;
  cost: number;
  startDate: string;
  endDate: string | null;
};

export type MaintenanceRecord = {
  id: number;
  vehicleId: number;
  title: string;
  description: string | null;
  cost: number;
  startDate: string;
  endDate: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceRecordWithVehicle = MaintenanceRecord & {
  vehiclePlateNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
};

export function getDefaultMaintenanceFormValues(): MaintenanceFormValues {
  const today = new Date().toISOString().split("T")[0];
  return {
    vehicleId: "",
    title: "",
    description: "",
    cost: "0.00",
    startDate: today,
    endDate: "",
  };
}

export function normalizeMaintenanceFormValues(
  values: MaintenanceFormValues,
): MaintenanceInput {
  return {
    vehicleId: Number(values.vehicleId),
    title: values.title.trim(),
    description: values.description.trim() === "" ? null : values.description.trim(),
    cost: Number(values.cost),
    startDate: values.startDate,
    endDate: values.endDate.trim() === "" ? null : values.endDate,
  };
}

export function getVehicleStatusAfterMaintenanceChange(
  currentStatus: "available" | "rented" | "maintenance" | "inactive",
  activeMaintenanceCount: number,
): "available" | "rented" | "maintenance" | "inactive" {
  if (currentStatus === "rented" || currentStatus === "inactive") {
    return currentStatus;
  }

  return activeMaintenanceCount > 0 ? "maintenance" : "available";
}
