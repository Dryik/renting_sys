import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ListToolbarProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ListToolbar({ actions, children, className }: ListToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="w-full max-w-md">{children}</div>
      {actions ? (
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
