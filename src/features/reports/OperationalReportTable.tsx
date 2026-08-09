import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import {
  formatCell,
  isEndAlignedHeader,
  isNowrapHeader,
} from "./operational-report-cells";
import { formatHeader } from "./operational-report-config";

/**
 * The generic table every operational report except the daily closing renders
 * into: headers from the report's column list, cells formatted by column name.
 *
 * It is given rows and told whether they are still loading; it never asks for
 * them. The empty message is passed in because it depends on the report type,
 * which the orchestrating component already knows.
 */
export function OperationalReportTable({
  emptyMessage,
  formatCurrency,
  headers,
  loading,
  numberFormatter,
  rows,
  t,
}: {
  emptyMessage: string;
  formatCurrency: (value: number) => string;
  headers: string[];
  loading: boolean;
  numberFormatter: Intl.NumberFormat;
  rows: Record<string, unknown>[];
  t: (key: string) => string;
}) {
  return (
    <DataTable
      className={cn("table-auto", headers.length > 5 ? "min-w-[960px]" : "min-w-full")}
      containerClassName="[&_td]:px-2 [&_th]:px-2 overflow-x-auto"
    >
      <thead>
        <tr>{headers.map((header) => <Th key={header}>{t(formatHeader(header))}</Th>)}</tr>
      </thead>
      <tbody>
        {loading ? (
          <EmptyTableRow colSpan={Math.max(1, headers.length)} message={t("Loading...")} state="loading" />
        ) : rows.length === 0 ? (
          <EmptyTableRow colSpan={Math.max(1, headers.length)} message={emptyMessage} />
        ) : (
          rows.map((row, index) => (
            <tr key={index}>
              {headers.map((header) => (
                <Td
                  key={header}
                  className={cn(
                    isEndAlignedHeader(header) ? "text-end" : undefined,
                    isNowrapHeader(header) ? "whitespace-nowrap" : undefined,
                  )}
                >
                  {formatCell(header, row[header], {
                    formatCurrency,
                    numberFormatter,
                    t,
                  })}
                </Td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}
