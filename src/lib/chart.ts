/** Calculs des graphiques (sans dépendance) : graduations, nombres compacts, tracés. */

const LOCALE = "fr-FR";

/** Graduations rondes depuis zéro (~5 intervalles, pas de 1, 2 ou 5 × 10ⁿ). */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const low = Math.min(0, min);
  if (!(max > low)) return [0, 1];
  const raw = (max - low) / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((n) => n * magnitude >= raw) ?? 10) * magnitude;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];
  // Dernière graduation au-dessus (ou au niveau) du maximum : la série ne dépasse jamais l'axe.
  for (let value = Math.floor(low / step) * step; ; value += step) {
    ticks.push(Number(value.toFixed(decimals)));
    if (value >= max - step * 1e-9) break;
  }
  return ticks;
}

const full = new Intl.NumberFormat(LOCALE);
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });

/** En entier sous 10 000, compact au-delà (12,9 k ; 4,2 M). */
export function compactNumber(value: number): string {
  return Math.abs(value) < 10_000 ? full.format(value) : compact.format(value);
}

/** Chemin SVG d'une série ; une valeur `null` interrompt la ligne (pas d'interpolation inventée). */
export function linePath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${round(x(index))},${round(y(value))}`;
    drawing = true;
  });
  return path;
}

const round = (value: number) => Math.round(value * 10) / 10;
