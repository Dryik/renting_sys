import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";

type SidePanelProps = {
  children: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
  width?: "md" | "lg";
};

const widthClass: Record<NonNullable<SidePanelProps["width"]>, string> = {
  md: "max-w-xl",
  lg: "max-w-5xl",
};

export function SidePanel({
  children,
  description,
  onClose,
  open,
  title,
  width = "lg",
}: SidePanelProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const dialog = (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-foreground/30 p-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-2xl",
          widthClass[width],
        )}
        data-motion="dialog"
        role="dialog"
      >
        <header className="flex min-h-16 shrink-0 items-start justify-between gap-4 border-b border-border/80 bg-muted px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-normal" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X data-icon="inline-start" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
