import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]",
        className,
        "text-center",
      )}
      {...props}
    />
  );
}

export { Textarea };
