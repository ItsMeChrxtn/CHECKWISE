import { cn } from "../utils/cn.js";

/**
 * The CheckWise mark: an answer bubble with a check struck through it.
 *
 * The old mark was a generic tick in a rounded square — the same shape a
 * hundred other products use. This one says what the tool does: the ring is the
 * bubble a student shades, the check is the mark it earned. It survives being
 * shrunk to a favicon because it is two strokes and nothing else.
 *
 * `tone` picks how it sits on its background:
 *   "brand"  — blue on transparent, for light surfaces
 *   "solid"  — white on a filled blue tile, for the app icon and the splash
 *   "invert" — white on transparent, for dark surfaces
 */
export function LogoMark({ size = 32, tone = "brand", className }) {
  const solid = tone === "solid";
  const stroke = solid || tone === "invert" ? "#ffffff" : "currentColor";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn(tone === "brand" && "text-brand-600", className)}
    >
      {solid && <rect width="32" height="32" rx="8" className="fill-brand-600" />}

      {/* The bubble. Left open at the top right so the check reads as passing
          through it rather than sitting on top. */}
      <path
        d="M23.4 11.2A9 9 0 1 0 25 16"
        stroke={stroke}
        strokeWidth={solid ? 2.4 : 2.6}
        strokeLinecap="round"
        opacity={solid ? 0.55 : 0.35}
      />

      {/* The mark it earned. */}
      <path
        d="M11.2 16.4 15 20.2 24.4 10.4"
        stroke={stroke}
        strokeWidth={solid ? 2.8 : 3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 26, title: "text-[15px]", tagline: "text-[10px]", gap: "gap-2.5" },
  md: { mark: 30, title: "text-[17px]", tagline: "text-[10px]", gap: "gap-3" },
  lg: { mark: 40, title: "text-2xl", tagline: "text-[11px]", gap: "gap-3.5" },
};

export default function Logo({
  size = "md",
  showTagline = true,
  className,
  inverted = false,
}) {
  const s = SIZES[size] || SIZES.md;

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <LogoMark size={s.mark} tone={inverted ? "invert" : "brand"} className="shrink-0" />

      <span className="min-w-0">
        <span
          className={cn(
            "block font-semibold leading-tight tracking-[-0.02em]",
            s.title,
            inverted ? "text-white" : "text-ink-900"
          )}
        >
          CheckWise
        </span>
        {showTagline && (
          <span
            className={cn(
              "block leading-tight tracking-[0.06em] uppercase",
              s.tagline,
              inverted ? "text-white/55" : "text-ink-400"
            )}
          >
            Smart Exam Checking
          </span>
        )}
      </span>
    </div>
  );
}
