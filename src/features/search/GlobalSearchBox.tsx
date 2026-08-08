import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useDebouncedValue } from "@/data/useDebouncedValue";
import { useI18n } from "@/hooks/useI18n";
import type { GlobalSearchResult } from "@/shared/search";

type GlobalSearchBoxProps = {
  onResult: (result: GlobalSearchResult) => void;
};

export function GlobalSearchBox({ onResult }: GlobalSearchBoxProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  // Closing is the only thing the user does directly — picking a result. The
  // panel's visibility is otherwise derived, so no effect has to push state
  // around to keep it in step with the request.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  // The same 180 ms wait as before; an empty box issues no request at all.
  const search = useDebouncedValue(query.trim(), 180);
  const resultsQuery = useBusinessQuery<GlobalSearchResult[]>(
    "search",
    "global",
    search,
    () => rentalAppApi.search.global(search),
    { enabled: search.length > 0 },
  );
  const results = (search ? resultsQuery.data : undefined) ?? [];
  const open =
    search.length > 0 && resultsQuery.isSuccess && dismissedFor !== search;

  return (
    <div className="relative w-full">
      <SearchInput
        containerClassName="max-w-none"
        className="bg-muted shadow-none"
        placeholder={t("Search everything")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setDismissedFor(null)}
      />
      {open ? (
        <div className="absolute z-40 mt-2 max-h-96 w-full overflow-auto rounded-xl border border-border/80 bg-popover p-2 shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t("No matches found.")}
            </div>
          ) : (
            results.map((result) => (
              <Button
                key={result.id}
                className="h-auto w-full justify-start px-3 py-2 text-start"
                type="button"
                variant="ghost"
                onClick={() => {
                  setDismissedFor(search);
                  setQuery("");
                  onResult(result);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    <span dir="auto">{result.title}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(formatGroup(result.group))} - <span dir="auto">{result.subtitle}</span>
                  </span>
                </span>
              </Button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatGroup(group: GlobalSearchResult["group"]): string {
  const labels: Record<GlobalSearchResult["group"], string> = {
    vehicles: "Vehicles",
    customers: "Customers",
    activeRentals: "Active Rentals",
    returnedRentals: "Returned Rentals",
    payments: "Payments",
  };

  return labels[group];
}
