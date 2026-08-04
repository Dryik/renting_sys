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
  const libyanMoneyPrefix = textValue.match(/^(-?)د\.ل\s+(.+)$/);
  const libyanMoneySuffix = textValue.match(/^(.+?)\s+د\.ل$/);

  if (libyanMoneyPrefix || libyanMoneySuffix) {
    const sign = libyanMoneyPrefix?.[1] ?? "";
    const amount = libyanMoneyPrefix?.[2] ?? libyanMoneySuffix?.[1] ?? "";
    const currencyFirst = Boolean(libyanMoneyPrefix);

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
        {currencyFirst ? <span dir="rtl">د.ل</span> : null}
        <span dir="ltr">{sign}{amount}</span>
        {!currencyFirst ? <span dir="rtl">د.ل</span> : null}
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
