"use client";

import { useEffect, useRef, useState } from "react";

import { compactNumber, linePath, niceTicks } from "@/lib/chart";

export type ChartSeries = { key: string; name: string; values: (number | null)[] };
export type ValueKind = "amount" | "count" | "percent";

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const HEIGHT = 280;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 64 };

function formatter(kind: ValueKind, currency: string) {
  if (kind === "percent") {
    const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
    return { full: (v: number) => pct.format(v), axis: (v: number) => pct.format(v) };
  }
  if (kind === "count") {
    const n = new Intl.NumberFormat("fr-FR");
    return { full: (v: number) => n.format(v), axis: compactNumber };
  }
  const digits = currency === "XOF" || currency === "XAF" ? 0 : 2;
  const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
  return { full: (v: number) => money.format(v / 10 ** digits), axis: (v: number) => compactNumber(v / 10 ** digits) };
}

/**
 * Courbes (2 px, une seule échelle) : couleur fixe par service (ordre de la sélection), légende
 * dès deux séries, réticule + info-bulle au survol et au clavier (flèches), trous pour les valeurs
 * absentes. Les valeurs détaillées restent disponibles dans la vue tableau de la page.
 */
export function LineChart({
  series,
  labels,
  kind,
  currency,
  title,
}: {
  series: ChartSeries[];
  labels: string[];
  kind: ValueKind;
  currency: string;
  title: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const format = formatter(kind, currency);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const ticks = niceTicks(Math.min(0, ...all), kind === "percent" ? Math.max(1, ...all) : Math.max(0, ...all));
  const yMin = ticks[0] ?? 0;
  const yMax = ticks[ticks.length - 1] ?? 1;
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const count = labels.length;
  const x = (index: number) => MARGIN.left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
  const y = (value: number) => MARGIN.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(plotWidth / 80))));

  const indexAt = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left - MARGIN.left) / plotWidth;
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
  };

  const TOOLTIP_WIDTH = 240;
  const tooltipLeft = active === null ? 0 : Math.min(Math.max(x(active) - TOOLTIP_WIDTH / 2, 0), width - TOOLTIP_WIDTH);

  return (
    <div className="space-y-3">
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Légende">
          {series.map((s, index) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: COLORS[index] }} />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={container} className="relative">
        {/* Largeur fluide avant la mesure, puis 1:1 (texte jamais déformé) une fois mesurée. */}
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={`${title} : ${count} intervalles. Flèches gauche et droite pour parcourir les valeurs.`}
          tabIndex={0}
          className="block focus-visible:outline-2 focus-visible:outline-slate-400"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const step = event.key === "ArrowLeft" ? -1 : 1;
            setActive((current) => Math.min(count - 1, Math.max(0, (current ?? (step > 0 ? -1 : count)) + step)));
          }}
          onBlur={() => setActive(null)}
          onPointerMove={(event) => setActive(indexAt(event.clientX, event.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[11px] tabular-nums">
                {format.axis(tick)}
              </text>
            </g>
          ))}
          {labels.map((label, index) =>
            index % labelEvery === 0 ? (
              <text key={label + index} x={x(index)} y={HEIGHT - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                {label}
              </text>
            ) : null,
          )}
          {active !== null ? (
            <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
          ) : null}
          {series.map((s, index) => (
            <g key={s.key}>
              <path d={linePath(s.values, x, y)} fill="none" stroke={COLORS[index]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((value, i) => {
                const isolated = value !== null && s.values[i - 1] == null && s.values[i + 1] == null;
                const highlighted = active === i && value !== null;
                return isolated || highlighted ? (
                  <circle key={i} cx={x(i)} cy={y(value)} r={4} fill={COLORS[index]} stroke="var(--chart-surface)" strokeWidth={2} />
                ) : null;
              })}
            </g>
          ))}
        </svg>
        {active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 w-60 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900"
            style={{ left: tooltipLeft }}
          >
            <p className="mb-1 font-medium">{labels[active]}</p>
            {series.map((s, index) => (
              <p key={s.key} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: COLORS[index] }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="tabular-nums">{s.values[active] == null ? "—" : format.full(s.values[active] as number)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
