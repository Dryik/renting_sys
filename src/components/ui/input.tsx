import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-sm shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-150 selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]",
        className,
        "text-center",
      )}
      {...props}
    />
  );
}

export { Input };
