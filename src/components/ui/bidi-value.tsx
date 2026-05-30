import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type BidiValueProps = ComponentProps<"span"> & {
  value: string | number | null | undefined;
  muted?: boolean;
  wrap?: boolean;
};

export function BidiValue({
  className,
  muted = false,
  value,
  wrap = false,
  ...props
}: BidiValueProps) {
  const textValue = value === null || value === undefined ? "" : String(value);
  const libyanMoney = textValue.match(/^(-?)د\.ل\s+(.+)$/);

  if (libyanMoney) {
    const [, sign, amount] = libyanMoney;

    return (
      <span
        data-bidi="ltr"
        dir="ltr"
        className={cn(
          "inline-flex max-w-full items-baseline justify-center gap-2 text-center tabular-nums",
          wrap ? "whitespace-normal break-all" : "whitespace-nowrap",
          muted && "text-muted-foreground",
          className,
        )}
        {...props}
      >
        {sign ? <span dir="ltr">{sign}</span> : null}
        <span dir="ltr">د.ل</span>
        <span dir="ltr">{amount}</span>
      </span>
    );
  }

  return (
    <span
      data-bidi="ltr"
      dir="ltr"
      className={cn(
        "inline-block max-w-full text-center tabular-nums",
        wrap ? "whitespace-normal break-all" : "whitespace-nowrap",
        muted && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {textValue}
    </span>
  );
}
