import { ChevronLeft, ChevronRight } from "lucide-react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { getPageRange, type PageResult } from "@/shared/pagination";

type PaginationControlsProps = {
  page: Pick<PageResult<unknown>, "page" | "pageSize" | "total" | "totalPages">;
  t: (key: string, values?: Record<string, string | number>) => string;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  page,
  t,
  onPageChange,
}: PaginationControlsProps) {
  const range = getPageRange(page);
  const canGoBack = page.page > 1;
  const canGoNext = page.page < page.totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        {page.total === 0 ? (
          t("Showing 0 of 0")
        ) : (
          <>
            {t("Showing")} <BidiValue value={range.from} />-<BidiValue value={range.to} />{" "}
            {t("of")} <BidiValue value={page.total} />
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoBack}
          onClick={() => onPageChange(page.page - 1)}
        >
          <ChevronLeft data-icon="inline-start" />
          {t("Previous")}
        </Button>
        <BidiValue
          className="min-w-20 text-center text-muted-foreground"
          value={`${page.page} / ${page.totalPages}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoNext}
          onClick={() => onPageChange(page.page + 1)}
        >
          {t("Next")}
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
