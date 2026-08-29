import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../utils/cn.js";

/** Compact page window: 1 … 4 [5] 6 … 12 */
function pageWindow(current, totalPages) {
  const pages = new Set([1, totalPages, current, current - 1, current + 1]);
  const visible = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const withGaps = [];
  visible.forEach((page, index) => {
    if (index > 0 && page - visible[index - 1] > 1) withGaps.push("gap");
    withGaps.push(page);
  });
  return withGaps;
}

export default function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null;
  const { page, totalPages, total, limit, hasPrev, hasNext } = pagination;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 sm:flex-row">
      <p className="text-sm text-ink-500">
        {total === 0 ? "No exams" : `Showing ${from}-${to} of ${total}`}
      </p>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrev}
            aria-label="Previous page"
            className="grid h-9 w-9 place-items-center rounded-lg border border-ink-300 text-ink-600 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>

          {pageWindow(page, totalPages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1.5 text-ink-400">
                &hellip;
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? "page" : undefined}
                className={cn(
                  "h-9 min-w-9 rounded-lg px-2.5 text-sm font-medium transition-colors",
                  item === page
                    ? "bg-brand-600 text-white"
                    : "border border-ink-300 text-ink-600 hover:bg-ink-50"
                )}
              >
                {item}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNext}
            aria-label="Next page"
            className="grid h-9 w-9 place-items-center rounded-lg border border-ink-300 text-ink-600 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
