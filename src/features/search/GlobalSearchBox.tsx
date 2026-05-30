import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { useI18n } from "@/hooks/useI18n";
import type { GlobalSearchResult } from "@/shared/search";

type GlobalSearchBoxProps = {
  onResult: (result: GlobalSearchResult) => void;
};

export function GlobalSearchBox({ onResult }: GlobalSearchBoxProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const search = query.trim();
    const timeout = window.setTimeout(() => {
      if (!search) {
        setResults([]);
        setOpen(false);
        return;
      }

      window.rentalApp.search
        .global(search)
        .then((items) => {
          setResults(items);
          setOpen(true);
        })
        .catch(() => {
          setResults([]);
          setOpen(false);
        });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [query]);

  return (
    <div className="relative w-full">
      <SearchInput
        containerClassName="max-w-none"
        className="bg-muted shadow-none"
        placeholder={t("Search everything")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(results.length > 0)}
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
                  setOpen(false);
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
