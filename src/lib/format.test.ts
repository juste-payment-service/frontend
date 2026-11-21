import { describe, expect, it } from "vitest";

import { formatAmount, formatDateTime, formatNumber } from "./format";

// Intl utilise des espaces insécables (fines) : comparées comme des espaces simples.
const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

describe("formatage", () => {
  it("affiche les montants en unité mineure selon la devise", () => {
    expect(plain(formatAmount(5000, "XOF"))).toBe("5 000 F CFA");
    expect(plain(formatAmount(1050, "EUR"))).toBe("10,50 €");
  });

  it("affiche les dates à l'heure du Bénin, en français", () => {
    expect(formatDateTime("2026-11-21T09:05:00Z")).toBe("21/11/2026 10:05");
    expect(formatDateTime(null)).toBe("—");
  });

  it("sépare les milliers", () => {
    expect(plain(formatNumber(1234567))).toBe("1 234 567");
  });
});
