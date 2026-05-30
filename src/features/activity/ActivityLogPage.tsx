import { Eye, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/ui/search-input";
import { SectionPanel } from "@/components/ui/section-panel";
import { SidePanel } from "@/components/ui/side-panel";
import { useI18n } from "@/hooks/useI18n";
import type { AuditEventRecord } from "@/shared/audit";
import type { PageResult } from "@/shared/pagination";
import { isRoleKey, roleLabels } from "@/shared/auth";

const emptyAuditPage: PageResult<AuditEventRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export function ActivityLogPage() {
  const { formatDateTime, language, t } = useI18n();
  const [auditPage, setAuditPage] = useState(emptyAuditPage);
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRecord | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = useCallback(async (nextPage = page) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.rentalApp.audit.list({
        page: nextPage,
        search,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setAuditPage(result);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Activity log could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, page, search, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAudit(page);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadAudit, page]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          placeholder={t("Search activity")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>{t("From")}</span>
            <Input
              type="date"
              value={dateFrom}
              className="w-40"
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>{t("To")}</span>
            <Input
              type="date"
              value={dateTo}
              className="w-40"
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <Button variant="outline" onClick={() => void loadAudit(page)}>
            <RefreshCw className="size-4" />
            {t("Refresh")}
          </Button>
        </div>
      </div>

      <SectionPanel
        title={t("Activity Log")}
        description={t("Review important local staff actions.")}
        badge={t("{{count}} shown", { count: auditPage.total })}
      >
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <DataTable className="min-w-[940px]" containerClassName="min-h-[22rem]">
          <thead>
            <tr>
              <Th>{t("Date & Time")}</Th>
              <Th>{t("User")}</Th>
              <Th>{t("Action")}</Th>
              <Th>{t("Affected record")}</Th>
              <Th>{t("Summary")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={6} message={t("Loading activity...")} state="loading" />
            ) : auditPage.rows.length === 0 ? (
              <EmptyTableRow colSpan={6} message={t("No activity yet")} />
            ) : (
              auditPage.rows.map((event) => (
                <tr key={event.id}>
                  <Td className="whitespace-nowrap">
                    <BidiValue value={formatDateTime(event.occurredAt)} />
                  </Td>
                  <Td>{event.actorFullNameSnapshot ?? t("System")}</Td>
                  <Td>{t(event.action)}</Td>
                  <Td>{formatAffectedRecord(event, t)}</Td>
                  <Td>
                    {language === "ar"
                      ? event.summaryAr ?? event.summaryEn ?? event.action
                      : event.summaryEn ?? event.summaryAr ?? event.action}
                  </Td>
                  <Td className="text-end">
                    <Button size="sm" variant="outline" onClick={() => setSelectedEvent(event)}>
                      <Eye className="size-4" />
                      {t("Details")}
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <PaginationControls page={auditPage} t={t} onPageChange={setPage} />
      </SectionPanel>

      <SidePanel
        open={Boolean(selectedEvent)}
        title={t("Activity Details")}
        description={selectedEvent ? t(selectedEvent.action) : undefined}
        width="md"
        onClose={() => setSelectedEvent(null)}
      >
        {selectedEvent ? (
          <ActivityDetails event={selectedEvent} />
        ) : null}
      </SidePanel>
    </div>
  );
}

function ActivityDetails({ event }: { event: AuditEventRecord }) {
  const { formatDateTime, language, t } = useI18n();
  const summary =
    language === "ar"
      ? event.summaryAr ?? event.summaryEn
      : event.summaryEn ?? event.summaryAr;

  return (
    <div className="flex flex-col gap-4">
      <Detail label={t("Date & Time")} value={formatDateTime(event.occurredAt)} />
      <Detail label={t("User")} value={event.actorFullNameSnapshot ?? t("System")} />
      <Detail label={t("Role")} value={formatRole(event.actorRoleKeySnapshot, language, t)} />
      <Detail label={t("Action")} value={t(event.action)} />
      <Detail label={t("Entity")} value={formatAffectedRecordText(event, t)} />
      {summary ? <Detail label={t("Summary")} value={summary} /> : null}
      {event.reason ? <Detail label={t("Reason")} value={event.reason} /> : null}
      <JsonDetails label={t("Before")} value={event.beforeJson} />
      <JsonDetails label={t("After")} value={event.afterJson} />
      <JsonDetails label={t("Metadata")} value={event.metadataJson} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/25 p-3">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function JsonDetails({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <details className="rounded-md border bg-muted/25 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{label}</summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
        {formatJson(value)}
      </pre>
    </details>
  );
}

function formatRole(
  roleKey: string | null,
  language: "ar" | "en",
  t: (key: string) => string,
): string {
  if (!roleKey) {
    return t("Not available");
  }

  return isRoleKey(roleKey) ? roleLabels[roleKey][language] : roleKey;
}

function formatEntityType(entityType: string): string {
  const labels: Record<string, string> = {
    auth: "Authentication",
    backup: "Backup",
    customer: "Customer",
    maintenance: "Maintenance",
    payment: "Payment",
    rental: "Rental",
    report: "Report",
    settings: "Settings",
    user: "User",
    vehicle: "Vehicle",
  };

  return labels[entityType] ?? entityType;
}

function formatAffectedRecord(
  event: AuditEventRecord,
  t: (key: string) => string,
) {
  const entityLabel = t(formatEntityType(event.entityType));
  const recordLabel = normalizeRecordLabel(event.entityType, event.entityLabel);

  if (!recordLabel) {
    return <span>{entityLabel}</span>;
  }

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <span className="shrink-0 text-muted-foreground">{entityLabel}</span>
      <span className="text-muted-foreground">·</span>
      {isLtrIdentifier(recordLabel) ? (
        <BidiValue className="min-w-0" value={recordLabel} />
      ) : (
        <span className="min-w-0 truncate" dir="auto">{recordLabel}</span>
      )}
    </span>
  );
}

function formatAffectedRecordText(
  event: AuditEventRecord,
  t: (key: string) => string,
): string {
  const entityLabel = t(formatEntityType(event.entityType));
  const recordLabel = normalizeRecordLabel(event.entityType, event.entityLabel);

  return recordLabel ? `${entityLabel} · ${recordLabel}` : entityLabel;
}

function normalizeRecordLabel(
  entityType: string,
  entityLabel: string | null,
): string | null {
  const label = entityLabel?.trim();

  if (!label) {
    return null;
  }

  if (
    label.toLowerCase() === entityType.toLowerCase() ||
    label.toLowerCase() === formatEntityType(entityType).toLowerCase()
  ) {
    return null;
  }

  return label;
}

function isLtrIdentifier(value: string): boolean {
  return /^[\d\s.,:;+\-/\\()[\]#A-Z_a-z]+$/.test(value);
}

function formatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
