import type { ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import type { RentalListRecord } from "@/shared/rentals";

/**
 * Which side panel the rentals page is showing, and what it is showing it for.
 *
 * The page owns the state; this type is here so the panel components and the
 * title helpers can name it without importing the page and forming a cycle.
 */
export type RentalPanelState =
  | { mode: "create" }
  | { mode: "edit-draft"; rental: RentalListRecord }
  | { mode: "detail"; rental: RentalListRecord }
  | { mode: "return"; rental: RentalListRecord }
  | { mode: "payment"; rental: RentalListRecord }
  | null;

export type PrintAction = "print" | "pdf";

export function getPanelTitle(
  panelState: RentalPanelState,
  t: (key: string) => string,
): string {
  if (panelState?.mode === "edit-draft") {
    return t("Edit Draft");
  }

  if (panelState?.mode === "detail") {
    return t("Rental Details");
  }

  if (panelState?.mode === "return") {
    return t("Return Vehicle");
  }

  if (panelState?.mode === "payment") {
    return t("Record Payment");
  }

  return t("New Rental");
}

export function getPanelDescription(
  panelState: RentalPanelState,
  t: (key: string) => string,
): ReactNode {
  if (panelState?.mode === "edit-draft" || panelState?.mode === "detail") {
    return (
      <>
        <BidiValue value={panelState.rental.contractNo} /> ·{" "}
        <span dir="auto">{panelState.rental.customerName}</span> ·{" "}
        <BidiValue value={panelState.rental.vehiclePlateNumber} />
      </>
    );
  }

  if (panelState?.mode === "return") {
    return (
      <>
        <BidiValue value={panelState.rental.contractNo} /> ·{" "}
        <BidiValue value={panelState.rental.vehiclePlateNumber} /> ·{" "}
        <span dir="auto">{panelState.rental.customerName}</span>
      </>
    );
  }

  if (panelState?.mode === "payment") {
    return (
      <>
        <BidiValue value={panelState.rental.contractNo} /> ·{" "}
        <span dir="auto">{panelState.rental.customerName}</span> ·{" "}
        <BidiValue value={panelState.rental.vehiclePlateNumber} />
      </>
    );
  }

  return t("Choose customer and vehicle, then activate the contract.");
}

export function canOperateRental(rental: RentalListRecord): boolean {
  return rental.status === "active" || rental.status === "overdue";
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
