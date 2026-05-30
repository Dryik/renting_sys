import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  description?: string;
  label: string;
  searchText?: string;
  value: string;
};

type SearchableSelectProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  emptyMessage: string;
  invalid?: boolean;
  maxVisibleOptions?: number;
  moreResultsMessage?: (count: number) => string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  value: string;
};

export function SearchableSelect({
  ariaLabel,
  className,
  disabled = false,
  emptyMessage,
  invalid = false,
  maxVisibleOptions = 10,
  moreResultsMessage,
  onValueChange,
  options,
  placeholder,
  value,
}: SearchableSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const selectedInputValue = selectedOption
    ? getOptionInputValue(selectedOption)
    : "";
  const inputValue = isOpen ? query : selectedInputValue;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      normalizeSearch(
        `${option.label} ${option.description ?? ""} ${option.searchText ?? ""}`,
      ).includes(normalizedQuery),
    );
  }, [options, query]);

  const visibleOptions = filteredOptions.slice(0, maxVisibleOptions);
  const hiddenCount = filteredOptions.length - visibleOptions.length;
  const activeIndex =
    visibleOptions.length === 0
      ? -1
      : Math.min(Math.max(highlightedIndex, 0), visibleOptions.length - 1);

  function selectOption(option: SearchableSelectOption) {
    onValueChange(option.value);
    setQuery("");
    setHighlightedIndex(0);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function clearSelection() {
    onValueChange("");
    setQuery("");
    setHighlightedIndex(0);
    setIsOpen(true);
    inputRef.current?.focus();
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
      }
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) =>
        visibleOptions.length === 0
          ? -1
          : Math.min(Math.max(current, 0) + 1, visibleOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        visibleOptions.length === 0 ? -1 : Math.max(current - 1, 0),
      );
      return;
    }

    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery("");
      setHighlightedIndex(0);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          aria-autocomplete="list"
          aria-controls={isOpen ? listboxId : undefined}
          aria-expanded={isOpen}
          aria-invalid={invalid}
          aria-label={ariaLabel}
          className="h-11 w-full rounded-md border border-input bg-card py-2 pe-16 ps-10 text-center text-sm shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:border-ring focus-visible:ring-ring/45 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          type="text"
          value={inputValue}
          onBlur={handleBlur}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightedIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setHighlightedIndex(0);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value ? (
            <button
              aria-label="Clear selection"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={clearSelection}
              onMouseDown={(event) => event.preventDefault()}
            >
              <X className="size-4" />
            </button>
          ) : null}
          <button
            aria-label="Open options"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={disabled}
            type="button"
            onClick={() => {
              setIsOpen((current) => {
                const nextOpen = !current;
                if (nextOpen) {
                  setQuery("");
                  setHighlightedIndex(0);
                }

                return nextOpen;
              });
              inputRef.current?.focus();
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-150",
                isOpen ? "rotate-180" : undefined,
              )}
            />
          </button>
        </div>
      </div>

      {isOpen && !disabled ? (
        <div
          className="absolute inset-x-0 z-50 mt-1 overflow-hidden rounded-md border border-border/80 bg-popover text-popover-foreground shadow-lg"
          id={listboxId}
          role="listbox"
        >
          <div className="max-h-72 overflow-y-auto py-1">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-3 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              visibleOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isHighlighted = index === activeIndex;

                return (
                  <button
                    key={option.value}
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-start text-sm transition-colors",
                      isHighlighted ? "bg-accent text-accent-foreground" : undefined,
                      isSelected ? "font-semibold" : undefined,
                    )}
                    role="option"
                    type="button"
                    onClick={() => selectOption(option)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" dir="auto">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span
                          className="mt-0.5 block truncate text-xs font-normal text-muted-foreground"
                          dir="auto"
                        >
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {hiddenCount > 0 && moreResultsMessage ? (
            <div className="border-t bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
              {moreResultsMessage(hiddenCount)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getOptionInputValue(option: SearchableSelectOption): string {
  return option.description ? `${option.label} - ${option.description}` : option.label;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}
