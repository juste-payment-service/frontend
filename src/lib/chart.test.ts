import { describe, expect, it } from "vitest";

import { compactNumber, linePath, niceTicks } from "./chart";

describe("graduations", () => {
  it("arrondit l'axe à des valeurs rondes depuis zéro", () => {
    expect(niceTicks(0, 123_000)).toEqual([0, 50_000, 100_000, 150_000]);
    expect(niceTicks(0, 0.94)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("garde un axe lisible sans donnée", () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });
});

describe("nombres compacts", () => {
  it("en entier sous 10 000, compact au-delà", () => {
    expect(compactNumber(1_000).replace(/\s/g, " ")).toBe("1 000");
    expect(compactNumber(12_900).replace(/\s/g, " ")).toBe("12,9 k");
    expect(compactNumber(4_200_000).replace(/\s/g, " ")).toBe("4,2 M");
  });
});

describe("tracé d'une série", () => {
  const x = (i: number) => i * 10;
  const y = (v: number) => 100 - v;

  it("relie les points", () => {
    expect(linePath([1, 2, 3], x, y)).toBe("M0,99L10,98L20,97");
  });

  it("laisse un trou pour une valeur absente (taux sans opération)", () => {
    expect(linePath([1, null, 3, 4], x, y)).toBe("M0,99M20,97L30,96");
  });
});
