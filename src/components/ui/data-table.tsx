import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className={cn("w-full border-collapse text-start text-sm", className)}>
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
      className={cn("bg-muted px-4 py-3 font-medium text-muted-foreground", className)}
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
    <td className={cn("border-t px-4 py-3 align-middle", className)} {...props}>
      {children}
    </td>
  );
}

export function EmptyTableRow({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td className="px-4 py-12 text-center text-muted-foreground" colSpan={colSpan}>
        {message}
      </td>
    </tr>
  );
}
