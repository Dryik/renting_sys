import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricItem = {
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "warning" | "danger";
};

type MetricStripProps = {
  columns?: 3 | 4 | 5;
  items: MetricItem[];
};

const toneClass: Record<NonNullable<MetricItem["tone"]>, string> = {
  default: "border-border bg-card",
  good: "border-border border-t-emerald-500 bg-card",
  warning: "border-border border-t-amber-500 bg-card",
  danger: "border-border border-t-destructive bg-card",
};

export function MetricStrip({ columns = 4, items }: MetricStripProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 3 && "md:grid-cols-3",
        columns === 4 && "md:grid-cols-2 xl:grid-cols-4",
        columns === 5 && "md:grid-cols-2 xl:grid-cols-5",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-md border px-4 py-3 shadow-xs",
            toneClass[item.tone ?? "default"],
          )}
        >
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <div className="mt-1 text-2xl font-semibold leading-none">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
