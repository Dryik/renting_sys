import { normalizeDigits } from "./numerals";

export type GlobalSearchResult = {
  id: string;
  group: "vehicles" | "customers" | "activeRentals" | "returnedRentals" | "payments";
  title: string;
  subtitle: string;
  entityType: "vehicle" | "customer" | "rental" | "payment";
  entityId: number;
  action?: "newRental" | "returnVehicle" | "recordPayment";
};

export function normalizeSearchText(value: string): string {
  return normalizeDigits(value)
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0640/g, "")
    .replace(/[\s-]+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeCompactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[\s-]+/g, "");
}
