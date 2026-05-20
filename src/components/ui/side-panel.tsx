import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SidePanelProps = {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
  width?: "md" | "lg";
};

const widthClass: Record<NonNullable<SidePanelProps["width"]>, string> = {
  md: "max-w-xl",
  lg: "max-w-3xl",
};

export function SidePanel({
  children,
  description,
  onClose,
  open,
  title,
  width = "lg",
}: SidePanelProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-foreground/20">
      <aside
        aria-modal="true"
        className={cn(
          "fixed inset-y-0 end-0 flex w-[min(100vw,48rem)] flex-col border-s bg-card shadow-xl",
          widthClass[width],
        )}
        role="dialog"
      >
        <header className="flex min-h-16 items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X data-icon="inline-start" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}
