import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

type StatusBadgeProps = {
  children: ReactNode;
  className?: string;
  tone?: StatusBadgeTone;
};

const toneClass: Record<StatusBadgeTone, string> = {
  default: "before:bg-current",
  success: "before:bg-current",
  warning: "before:bg-current",
  danger: "before:bg-current",
  neutral: "before:bg-current",
};

export function StatusBadge({
  children,
  className,
  tone = "neutral",
}: StatusBadgeProps) {
  const variant =
    tone === "danger"
      ? "destructive"
      : tone === "success"
        ? "success"
        : tone === "warning"
          ? "warning"
          : tone === "default"
            ? "default"
            : "secondary";

  return (
    <Badge
      data-status-tone={tone}
      variant={variant}
      className={cn(
        "gap-1.5 before:inline-block before:size-1.5 before:rounded-full before:content-['']",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}
