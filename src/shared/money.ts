const currencySymbolMap: Record<string, string> = {
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  LYD: "LYD",
  USD: "$",
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
    const displayCurrency = currencySymbolMap[upperCurrency] ?? upperCurrency;
    return `${formatNumber(amount)} ${displayCurrency}`;
  }

  if (normalizedCurrency.length > 0) {
    if (/^[^\w\s]+$/.test(normalizedCurrency)) {
      return `${normalizedCurrency}${formatNumber(amount)}`;
    }

    return `${formatNumber(amount)} ${normalizedCurrency}`;
  }

  return formatNumber(amount);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
