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
  default: "before:bg-current shadow-[0_0_10px_rgba(59,130,246,0.2)] dark:shadow-[0_0_12px_rgba(59,130,246,0.3)]",
  success: "before:bg-current shadow-[0_0_10px_rgba(16,185,129,0.2)] dark:shadow-[0_0_12px_rgba(16,185,129,0.3)]",
  warning: "before:bg-current shadow-[0_0_10px_rgba(245,158,11,0.2)] dark:shadow-[0_0_12px_rgba(245,158,11,0.3)]",
  danger: "before:bg-current shadow-[0_0_10px_rgba(239,68,68,0.25)] dark:shadow-[0_0_12px_rgba(239,68,68,0.35)]",
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
