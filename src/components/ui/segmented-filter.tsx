import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SegmentedFilterProps<TValue extends string> = {
  label?: string;
  onChange: (value: TValue) => void;
  options: Array<{ label: string; value: TValue }>;
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
          </Button>
        );
      })}
    </div>
  );
}
