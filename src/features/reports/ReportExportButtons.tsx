import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import type { ReportExportType } from "@/shared/reports";

type ReportExportButtonsProps = {
  type: ReportExportType;
  date?: string;
  disabled?: boolean;
  startDate?: string;
  endDate?: string;
};

export function ReportExportButtons({
  date,
  disabled = false,
  endDate,
  startDate,
  type,
}: ReportExportButtonsProps) {
  const { can } = useAuth();
  const { t } = useI18n();
  const [message, setMessage] = useState<string | null>(null);

  if (!can("reports.export")) {
    return null;
  }

  async function exportReport(format: "csv" | "xlsx") {
    const result = await window.rentalApp.reports.export({
      type,
      format,
      date,
      startDate,
      endDate,
    });

    setMessage(
      result.success
        ? t("Report exported successfully.")
        : t(result.error ?? "Report export failed."),
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message ? (
        <span className="text-sm text-muted-foreground">{message}</span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        title={disabled ? t("No data available to export.") : undefined}
        onClick={() => void exportReport("csv")}
      >
        <FileText data-icon="inline-start" />
        {t("Export CSV")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        title={disabled ? t("No data available to export.") : undefined}
        onClick={() => void exportReport("xlsx")}
      >
        <FileSpreadsheet data-icon="inline-start" />
        {t("Export Excel")}
      </Button>
    </div>
  );
}
