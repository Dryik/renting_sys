import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3.5 focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "border-primary/15 bg-accent text-primary [a&]:hover:bg-accent/80",
        secondary:
          "border-border bg-secondary text-muted-foreground [a&]:hover:bg-secondary/90",
        success:
          "border-success/20 bg-success/10 text-success [a&]:hover:bg-success/15",
        warning:
          "border-warning/25 bg-warning/10 text-warning [a&]:hover:bg-warning/15",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive [a&]:hover:bg-destructive/15 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40",
        info:
          "border-primary/15 bg-accent text-primary [a&]:hover:bg-accent/80",
        outline:
          "border-input bg-card text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
