import { Inbox, Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
  containerClassName,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <div
      data-slot="data-table"
      className={cn(
        "overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-sm",
        containerClassName,
      )}
    >
      <table
        className={cn(
          "w-full border-collapse text-center text-sm leading-5",
          className,
          "text-center",
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  ...props
}: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "bg-muted/85 px-4 py-3 text-center text-xs font-bold text-muted-foreground",
        className,
        "text-center",
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  ...props
}: ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "border-t border-border/70 px-4 py-3.5 align-middle",
        className,
        "text-center",
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function EmptyTableRow({
  action,
  colSpan,
  description,
  message,
  state,
}: {
  action?: {
    label: string;
    onClick: () => void;
  };
  colSpan: number;
  description?: string;
  message: string;
  state?: "empty" | "loading";
}) {
  const resolvedState = state ?? "empty";
  const Icon = resolvedState === "loading" ? Loader2 : Inbox;

  return (
    <tr data-empty-row>
      <td className="border-t border-border/70 px-4 py-12" colSpan={colSpan}>
        <div
          className="mx-auto flex min-h-28 max-w-md flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/50 px-5 py-6 text-center text-muted-foreground"
          aria-live={resolvedState === "loading" ? "polite" : undefined}
          role={resolvedState === "loading" ? "status" : undefined}
        >
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-xs",
              resolvedState === "loading" && "text-primary",
            )}
          >
            <Icon
              className={cn(
                "size-5",
                resolvedState === "loading" && "animate-spin",
              )}
            />
          </span>
          <span className="text-sm font-semibold text-foreground">{message}</span>
          {description ? (
            <span className="max-w-sm text-sm leading-6 text-muted-foreground">
              {description}
            </span>
          ) : null}
          {action && resolvedState !== "loading" ? (
            <Button type="button" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
