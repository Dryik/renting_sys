import { Badge } from "@/components/ui/badge";

type StatusBadgeProps = {
  children: string;
  tone?: "default" | "success" | "warning" | "danger" | "neutral";
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
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

  return <Badge variant={variant}>{children}</Badge>;
}
