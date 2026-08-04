import { Ban, CarFront, Edit, FileDown, Gauge, Printer, Tag, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DocumentPhotoSection } from "@/components/ui/document-photo-section";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { formatPaymentMethod } from "@/shared/payments";
import {
  formatVehicleSaleStatus,
  type VehicleSaleListRecord,
} from "@/shared/vehicle-sales";
import { formatVehicleType, type VehicleRecord } from "@/shared/vehicles";
import { VehicleStatusBadge } from "./VehicleStatusBadge";

type VehicleDetailsPanelProps = {
  onEditVehicle?: () => void;
  onSaleChanged?: () => Promise<void> | void;
  onSellVehicle?: (vehicle: VehicleRecord) => void;
  vehicle: VehicleRecord;
};

export function VehicleDetailsPanel({
  onEditVehicle,
  onSaleChanged,
  onSellVehicle,
  vehicle,
}: VehicleDetailsPanelProps) {
  const { can } = useAuth();
  const { formatCurrency, formatDate, language, settings, t } = useI18n();
  const [sale, setSale] = useState<VehicleSaleListRecord | null>(null);
  const [isSaleLoading, setIsSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [isMutatingSale, setIsMutatingSale] = useState(false);
  const [printAction, setPrintAction] = useState<"print" | "pdf" | null>(null);

  const loadSale = useCallback(async () => {
    if (vehicle.displayStatus !== "sold" && !vehicle.activeSaleId) {
      setSale(null);
      return;
    }

    setIsSaleLoading(true);
    setSaleError(null);

    try {
      setSale(await window.rentalApp.vehicleSales.getForVehicle(vehicle.id));
    } catch (error) {
      setSaleError(getErrorMessage(error, t("Vehicle sale could not be loaded.")));
    } finally {
      setIsSaleLoading(false);
    }
  }, [t, vehicle.activeSaleId, vehicle.displayStatus, vehicle.id]);

  useEffect(() => {
    let cancelled = false;

    window.queueMicrotask(() => {
      if (!cancelled) {
        void loadSale();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadSale]);

  const canSellVehicle =
    Boolean(onSellVehicle) &&
    can("vehicleSales.create") &&
    vehicle.displayStatus !== "sold" &&
    (vehicle.status === "available" || vehicle.status === "inactive");

  async function handlePrintSale(printToPDF: boolean) {
    if (!sale) {
      return;
    }

    setPrintAction(printToPDF ? "pdf" : "print");
    setSaleError(null);

    try {
      await window.rentalApp.vehicleSales.printReceipt(sale.id, printToPDF);
    } catch (error) {
      setSaleError(getErrorMessage(error, t("Operation Failed")));
    } finally {
      setPrintAction(null);
    }
  }

  async function handleVoidSale(values: { approvalToken?: string; reason?: string }) {
    if (!sale || !values.reason) {
      return;
    }

    setIsMutatingSale(true);
    setSaleError(null);

    try {
      await window.rentalApp.vehicleSales.void({
        approvalToken: values.approvalToken,
        reason: values.reason,
        saleId: sale.id,
      });
      setVoidDialogOpen(false);
      setSale(null);
      await onSaleChanged?.();
    } catch (error) {
      setSaleError(getErrorMessage(error, t("Vehicle sale could not be voided.")));
    } finally {
      setIsMutatingSale(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <CarFront className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold tracking-normal">
                <BidiValue value={vehicle.plateNumber} /> - {vehicle.brand} {vehicle.model}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatVehicleType(vehicle.type, language)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VehicleStatusBadge status={vehicle.displayStatus} />
            {onEditVehicle ? (
              <Button type="button" size="sm" variant="outline" onClick={onEditVehicle}>
                <Edit data-icon="inline-start" />
                {t("Edit")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Detail label={t("Plate Number")} value={<BidiValue value={vehicle.plateNumber} wrap />} />
          <Detail label={t("Chassis Number")} value={vehicle.chassisNumber ? <BidiValue value={vehicle.chassisNumber} wrap /> : t("No details")} />
          <Detail label={t("Vehicle")} value={`${vehicle.brand} ${vehicle.model}`} />
          <Detail label={t("Color")} value={vehicle.color || t("No color or year")} />
          <Detail label={t("Year")} value={vehicle.year ? <BidiValue value={vehicle.year} /> : t("No date")} />
          <Detail icon={<WalletCards className="size-4" />} label={t("Daily Price")} value={<BidiValue value={formatCurrency(vehicle.dailyPrice)} />} />
          {settings.enableClientDeposit ? (
            <Detail label={t("Deposit")} value={<BidiValue value={formatCurrency(vehicle.depositAmount)} />} />
          ) : null}
          <Detail icon={<Gauge className="size-4" />} label={t("Mileage")} value={vehicle.mileage !== null ? <BidiValue value={vehicle.mileage} /> : t("No details")} />
          <Detail label={t("Mandatory Insurance Expiry")} value={vehicle.insuranceExpiryDate ? <BidiValue value={formatDate(vehicle.insuranceExpiryDate)} /> : t("No date")} />
          <Detail label={t("Vehicle License Expiry")} value={vehicle.registrationExpiryDate ? <BidiValue value={formatDate(vehicle.registrationExpiryDate)} /> : t("No date")} />
          <Detail label={t("Technical Inspection Expiry")} value={vehicle.technicalInspectionExpiryDate ? <BidiValue value={formatDate(vehicle.technicalInspectionExpiryDate)} /> : t("No date")} />
          <Detail label={t("Last Oil Change Date")} value={vehicle.lastOilChangeDate ? <BidiValue value={formatDate(vehicle.lastOilChangeDate)} /> : t("No date")} />
          <Detail label={t("Oil Change Mileage")} value={vehicle.lastOilChangeMileage !== null ? <BidiValue value={vehicle.lastOilChangeMileage} /> : t("No details")} />
        </div>

        {saleError ? (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(saleError)}
          </div>
        ) : null}

        {isSaleLoading ? (
          <div className="mt-4 rounded-lg border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
            {t("Loading sale details...")}
          </div>
        ) : sale ? (
          <VehicleSaleSummary
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            language={language}
            sale={sale}
            t={t}
          />
        ) : canSellVehicle ? (
          <div className="mt-4 flex justify-end border-t pt-4">
            <Button onClick={() => onSellVehicle?.(vehicle)}>
              <Tag data-icon="inline-start" />
              {t("Sell Vehicle")}
            </Button>
          </div>
        ) : null}

        {vehicle.notes ? (
          <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="mb-1 font-medium">{t("Notes")}</p>
            <p className="text-muted-foreground" dir="auto">{vehicle.notes}</p>
          </div>
        ) : null}

        {sale ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
            {sale.status === "posted" && can("vehicleSales.void") ? (
              <Button
                className="border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isMutatingSale}
                variant="outline"
                onClick={() => setVoidDialogOpen(true)}
              >
                <Ban data-icon="inline-start" />
                {t("Void Sale")}
              </Button>
            ) : null}
            <Button
              disabled={printAction !== null}
              variant="outline"
              onClick={() => void handlePrintSale(false)}
            >
              <Printer data-icon="inline-start" />
              {t("Print Receipt")}
            </Button>
            <Button
              disabled={printAction !== null}
              variant="outline"
              onClick={() => void handlePrintSale(true)}
            >
              <FileDown data-icon="inline-start" />
              {t("PDF")}
            </Button>
          </div>
        ) : null}
      </section>

      <DocumentPhotoSection entityType="vehicle" entityId={vehicle.id} />
      <SensitiveActionDialog
        action="vehicleSales.void"
        open={voidDialogOpen}
        title={t("Void vehicle sale?")}
        description={t("Enter the void reason and owner PIN if required.")}
        ownerPinRequired={settings.ownerPinEnabled}
        reasonLabel={t("Void reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Void Sale")}
        variant="destructive"
        isBusy={isMutatingSale}
        onCancel={() => setVoidDialogOpen(false)}
        onConfirm={(values) => void handleVoidSale(values)}
      />
    </div>
  );
}

function VehicleSaleSummary({
  formatCurrency,
  formatDate,
  language,
  sale,
  t,
}: {
  formatCurrency: (value: number) => string;
  formatDate: (value: string | Date) => string;
  language: "ar" | "en";
  sale: VehicleSaleListRecord;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold">{t("Sale Details")}</div>
          <BidiValue
            className="text-xs text-muted-foreground"
            value={sale.saleNo}
          />
        </div>
        <VehicleStatusBadge status={sale.status === "posted" ? "sold" : "inactive"} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Detail label={t("Sale Date")} value={<BidiValue value={formatDate(sale.saleDate)} />} />
        <Detail label={t("Sale Price")} value={<BidiValue value={formatCurrency(sale.salePrice)} />} />
        <Detail label={t("Payment Method")} value={formatPaymentMethod(sale.paymentMethod, language)} />
        <Detail label={t("Sale Status")} value={formatVehicleSaleStatus(sale.status, language)} />
        <Detail label={t("Buyer Name")} value={sale.buyerName} />
        <Detail label={t("Buyer Phone")} value={sale.buyerPhone ? <BidiValue value={sale.buyerPhone} /> : t("Not available")} />
        <Detail label={t("Buyer ID Number")} value={sale.buyerIdNumber ? <BidiValue value={sale.buyerIdNumber} /> : t("Not available")} />
      </div>
      {sale.notes ? (
        <div className="mt-3 rounded-lg border bg-card/80 p-3 text-sm">
          <div className="mb-1 font-medium">{t("Notes")}</div>
          <p className="text-muted-foreground" dir="auto">{sale.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
      <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="break-words font-medium">{value}</div>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
