import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { cn } from "@/lib/utils";

type SidePanelProps = {
  children: ReactNode;
  closeDisabled?: boolean;
  description?: ReactNode;
  footer?: ReactNode;
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
  closeDisabled = false,
  description,
  footer,
  onClose,
  open,
  title,
  width = "lg",
}: SidePanelProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useModalBehavior({ closeDisabled, containerRef: dialogRef, onClose, open });

  if (!open) {
    return null;
  }

  const dialog = (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-foreground/30 p-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <section
        ref={dialogRef}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-2xl",
          widthClass[width],
        )}
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
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
            disabled={closeDisabled}
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X data-icon="inline-start" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-border/80 bg-card px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
