import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type BidiValueProps = ComponentProps<"span"> & {
  value: string | number | null | undefined;
  muted?: boolean;
};

export function BidiValue({
  className,
  muted = false,
  value,
  ...props
}: BidiValueProps) {
  return (
    <span
      data-bidi="ltr"
      dir="ltr"
      className={cn(
        "inline-block max-w-full whitespace-nowrap text-left tabular-nums",
        muted && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {value ?? ""}
    </span>
  );
}
