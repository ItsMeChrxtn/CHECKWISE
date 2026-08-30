import { cn } from "../utils/cn.js";

const TONES = {
  brand: "text-brand-600",
  emerald: "text-pass-600",
  amber: "text-warn-600",
  sky: "text-accent-600",
};

/**
 * One headline figure from a register.
 *
 * The icon sits small and unboxed beside the label rather than in a tinted
 * chip: on a screen of four of these, four coloured squares are the loudest
 * thing on the page, and the number is what matters. The figure itself is set
 * in the serif with tabular figures, so a row of them lines up and stays put as
 * values update.
 */
export default function StatCard({ icon: Icon, label, value, sublabel, tone = "brand", loading }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon size={14} aria-hidden="true" className={cn("shrink-0", TONES[tone])} />
        )}
        <p className="eyebrow truncate">{label}</p>
      </div>

      {loading ? (
        <div className="mt-3 h-9 w-24 animate-pulse rounded-sm bg-ink-100" />
      ) : (
        <p className="figure mt-2 text-[26px] leading-none sm:mt-2.5 sm:text-[32px]">{value}</p>
      )}

      {sublabel && !loading && (
        <p className="mt-2 truncate text-xs text-ink-500">{sublabel}</p>
      )}
    </div>
  );
}
