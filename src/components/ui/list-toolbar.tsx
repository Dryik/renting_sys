import type { ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";

type ListToolbarProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ListToolbar({ actions, children, className }: ListToolbarProps) {
  const { dir } = useI18n();

  return (
    <div
      dir="ltr"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="w-full max-w-md" dir={dir}>{children}</div>
      {actions ? (
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto" dir={dir}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
