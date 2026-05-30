const currencyDisplayMap: Record<string, { symbol: string; position: "prefix" | "suffix" }> = {
  EUR: { symbol: "€", position: "prefix" },
  GBP: { symbol: "£", position: "prefix" },
  JPY: { symbol: "¥", position: "prefix" },
  LYD: { symbol: "د.ل", position: "prefix" },
  USD: { symbol: "$", position: "prefix" },
};

export function formatMoney(
  value: number,
  currency = "USD",
  _locale?: string,
): string {
  void _locale;

  const amount = Number.isFinite(value) ? value : 0;
  const normalizedCurrency = currency.trim();
  const upperCurrency = normalizedCurrency.toUpperCase();

  if (/^[A-Z]{3}$/.test(upperCurrency)) {
    const displayCurrency = currencyDisplayMap[upperCurrency];

    if (displayCurrency) {
      return formatCurrencyWithPosition(amount, displayCurrency);
    }

    return `${formatNumber(amount)} ${upperCurrency}`;
  }

  if (normalizedCurrency.length > 0) {
    if (/^[^\w\s]+$/.test(normalizedCurrency)) {
      return `${normalizedCurrency}${formatNumber(amount)}`;
    }

    return `${formatNumber(amount)} ${normalizedCurrency}`;
  }

  return formatNumber(amount);
}

function formatCurrencyWithPosition(
  value: number,
  display: { symbol: string; position: "prefix" | "suffix" },
): string {
  const amount = formatNumber(value);

  if (display.position === "prefix") {
    return `${display.symbol} ${amount}`;
  }

  return `${amount} ${display.symbol}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
