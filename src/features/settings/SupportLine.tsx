import { BidiValue } from "@/components/ui/bidi-value";
import type { ReactNode } from "react";

/**
 * A single support or diagnostic detail line.
 */
export function SupportLine({
  icon,
  label,
  value,
  valueMode = "auto",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueMode?: "auto" | "ltr";
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="break-words font-medium">
          {valueMode === "ltr" ? <BidiValue value={value} wrap /> : <span dir="auto">{value}</span>}
        </p>
      </div>
    </div>
  );
}
