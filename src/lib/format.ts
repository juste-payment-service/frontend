/** Formatage pour l'affichage (français, heure du Bénin). Les montants sont en unité mineure. */

const LOCALE = "fr-FR";
const TIME_ZONE = "Africa/Porto-Novo";
const MINOR_DIGITS: Record<string, number> = { XOF: 0, XAF: 0, EUR: 2, USD: 2 };

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});
const number = new Intl.NumberFormat(LOCALE);

export function formatAmount(minor: number, currency: string): string {
  const digits = MINOR_DIGITS[currency] ?? 2;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date).replace(",", "");
}

export function formatNumber(value: number): string {
  return number.format(value);
}
