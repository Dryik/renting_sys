import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg.lucide-loader-circle]:animate-spin [&_svg.lucide-loader-pinwheel]:animate-spin [&_svg.lucide-loader]:animate-spin focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-[var(--arak-primary-hover)]",
        destructive:
          "border border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-input bg-card text-foreground shadow-xs hover:border-primary/35 hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "border border-transparent bg-accent text-accent-foreground shadow-xs hover:bg-accent/80",
        ghost: "border border-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-9 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5",
        lg: "h-12 px-5 text-sm has-[>svg]:px-4",
        icon: "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
