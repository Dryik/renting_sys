import { Button } from "@/components/ui/button";
import { BidiValue } from "@/components/ui/bidi-value";
import { cn } from "@/lib/utils";

export type SegmentedFilterOption<TValue extends string> = {
  count?: number;
  label: string;
  tone?: "default" | "danger" | "warning";
  value: TValue;
};

type SegmentedFilterProps<TValue extends string> = {
  label?: string;
  onChange: (value: TValue) => void;
  options: Array<SegmentedFilterOption<TValue>>;
  t: (key: string) => string;
  value: TValue;
};

export function SegmentedFilter<TValue extends string>({
  label,
  onChange,
  options,
  t,
  value,
}: SegmentedFilterProps<TValue>) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-1.5 shadow-sm">
      {label ? (
        <span className="px-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {t(label)}
        </span>
      ) : null}
      {options.map((option) => {
        const selected = value === option.value;

        return (
          <Button
            key={option.value}
            aria-pressed={selected}
            type="button"
            size="sm"
            variant={selected ? "secondary" : "ghost"}
            className={cn(
              selected && "border-primary/15 text-primary shadow-none",
              !selected && "text-muted-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {t(option.label)}
            {option.count !== undefined ? (
              <BidiValue
                className={cn(
                  "min-w-5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-bold leading-none",
                  option.tone === "danger" && "bg-destructive/10 text-destructive",
                  option.tone === "warning" && "bg-warning/10 text-warning",
                  selected && option.tone === "default" && "bg-primary/10 text-primary",
                )}
                value={option.count}
              />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
