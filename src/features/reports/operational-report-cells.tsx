import type { ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";

/**
 * How one cell is rendered, decided from its column name.
 *
 * These reports are generic: a row is a bag of keys, and the column name is the
 * only signal available for whether a value is money, a count, a percentage, an
 * enum to translate, or a string that must stay left-to-right inside an Arabic
 * page. The regexes below are that signal, unchanged from where they lived
 * inside the component.
 */
export type CellFormatOptions = {
  formatCurrency: (value: number) => string;
  numberFormatter: Intl.NumberFormat;
  t: (key: string) => string;
};

export function formatCell(
  header: string,
  value: unknown,
  { formatCurrency, numberFormatter, t }: CellFormatOptions,
): ReactNode {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    if (isPercentHeader(header)) {
      return <BidiValue value={`${numberFormatter.format(value)}%`} />;
    }

    if (isCountHeader(header)) {
      return <BidiValue value={numberFormatter.format(value)} />;
    }

    if (isMoneyHeader(header)) {
      return (
        <BidiValue
          className={isRefundHeader(header) && value !== 0 ? "text-warning" : undefined}
          value={formatCurrency(value)}
        />
      );
    }

    return <BidiValue value={numberFormatter.format(value)} />;
  }

  const text = String(value);

  if (isEnumHeader(header)) {
    return <span dir="auto">{t(text)}</span>;
  }

  if (isLtrCell(header, text)) {
    return <BidiValue value={text} />;
  }

  return <span dir="auto">{text}</span>;
}

export function isEndAlignedHeader(header: string): boolean {
  return isMoneyHeader(header) || isPercentHeader(header) || isCountHeader(header);
}

export function isNowrapHeader(header: string): boolean {
  return /phone|plate|contract|date|datetime|status|amount|paid|remaining|held|refund|cost|income|net|type|method/i.test(header);
}

function isMoneyHeader(header: string): boolean {
  return /amount|payment|payments|transfer|refund|collected|deposit|required|paid|held|income|cost|net|expense|withdrawal|cash|difference|price|sales/i.test(header);
}

function isRefundHeader(header: string): boolean {
  return /refund/i.test(header);
}

function isCountHeader(header: string): boolean {
  return /count|days|id$|createdToday|unpaidToday/i.test(header);
}

function isPercentHeader(header: string): boolean {
  return /percent/i.test(header);
}

function isEnumHeader(header: string): boolean {
  return /status|type|method/i.test(header);
}

function isLtrCell(header: string, value: string): boolean {
  return (
    /date|datetime|at$|expiry|return|phone|plate|contract|receipt|path|version|id$/i.test(header) ||
    /^[\d\s.,:;+\-/\\()[\]#A-Z_a-z]+$/.test(value)
  );
}
