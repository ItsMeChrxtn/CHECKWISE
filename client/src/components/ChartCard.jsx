/**
 * Shared chart chrome and tokens.
 *
 * Every dashboard chart plots a SINGLE series, so identity never rides on
 * colour: one validated brand hue is reused throughout, there is no legend, and
 * values are carried by the axis plus the hover tooltip rather than a label on
 * every mark.
 *
 * VIZ.series is brand-600 (#274568), the institutional navy. Against the white
 * card surface it measures 9.4:1 — comfortably past the 3:1 a chart mark needs,
 * and dark enough that a single thin line still reads on a laptop screen in a
 * bright classroom.
 */
export const VIZ = {
  series: "#274568",
  seriesSoft: "#c4d1e0",
  /* Brass, for the one mark that should stand out of a series — a target line
     or the currently selected bar. */
  accent: "#a8822f",
  grid: "#dfe3ea",
  axisText: "#6d7688",
  surface: "#ffffff",
};

export const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: VIZ.axisText, fontSize: 12 },
};

/**
 * Marks render at their final value immediately. Recharts' 1.5s grow-in is the
 * "excessive animation" the brief rules out, and it leaves charts looking empty
 * on slower mobile paints.
 */
export const NO_ANIMATION = { isAnimationActive: false };

/**
 * Single-line category tick. Recharts' default tick wraps long text to a second
 * line, which strands the ellipsis on its own row; this truncates instead.
 */
export function CategoryTick({ x, y, payload, max = 22 }) {
  const value = String(payload.value);
  const label = value.length > max ? `${value.slice(0, max - 1)}…` : value;

  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={VIZ.axisText} fontSize={12}>
      <title>{value}</title>
      {label}
    </text>
  );
}

export function ChartCard({ title, description, action, children, footer }) {
  return (
    <section className="card flex flex-col p-5">
      <div className="mb-5 flex items-start justify-between gap-3 border-b border-ink-200 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
        </div>
        {action}
      </div>

      <div className="flex-1">{children}</div>
      {footer}
    </section>
  );
}

/** Hover layer. Recharts passes the hovered payload in. */
export function ChartTooltip({ active, payload, label, unit = "", valueLabel }) {
  if (!active || !payload?.length) return null;

  const point = payload[0];

  return (
    <div className="overlay rounded-sm border border-ink-200 bg-white px-3 py-2">
      <p className="eyebrow">{point.payload.tooltipLabel || label}</p>
      <p className="figure mt-1 text-base">
        {valueLabel ? `${valueLabel}: ` : ""}
        {point.value}
        {unit}
      </p>
    </div>
  );
}
