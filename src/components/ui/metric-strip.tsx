import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricItem = {
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "warning" | "danger";
};

type MetricStripProps = {
  align?: "center" | "start";
  columns?: 3 | 4 | 5;
  items: MetricItem[];
};

const toneClass: Record<NonNullable<MetricItem["tone"]>, string> = {
  default: "border-border/80 bg-card text-foreground",
  good: "border-success/20 bg-success/5 text-success",
  warning: "border-warning/25 bg-warning/5 text-warning",
  danger: "border-destructive/25 bg-destructive/5 text-destructive",
};

export function MetricStrip({ align = "start", columns = 4, items }: MetricStripProps) {
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
            "min-h-28 rounded-lg border px-5 py-4 shadow-xs transition-[border-color,box-shadow] duration-150",
            "rounded-2xl",
            align === "center" && "text-center",
            toneClass[item.tone ?? "default"],
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">{item.label}</p>
          <div className="mt-4 min-h-8 text-3xl font-bold leading-none tracking-normal">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
