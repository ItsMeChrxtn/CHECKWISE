import { CircleDashed, CircleCheck, CircleAlert } from "lucide-react";
import { cn } from "../utils/cn.js";

/**
 * The exam workflow status, derived server-side from what the exam actually
 * holds - so the badge can never disagree with the data.
 */
export const EXAM_STATUS_META = {
  draft: {
    label: "Draft",
    icon: CircleDashed,
    className: "bg-ink-100 text-ink-600",
    hint: "No answer key yet. Upload one to add questions.",
  },
  "needs-review": {
    label: "Needs review",
    icon: CircleAlert,
    className: "bg-warn-50 text-warn-600",
    hint: "Questions were extracted but not confirmed yet.",
  },
  ready: {
    label: "Ready",
    icon: CircleCheck,
    className: "bg-pass-50 text-pass-700",
    hint: "Answer key confirmed. Ready to generate answer sheets.",
  },
};

export default function StatusBadge({ status, className }) {
  const meta = EXAM_STATUS_META[status] ?? EXAM_STATUS_META.draft;
  const Icon = meta.icon;

  return (
    <span
      title={meta.hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
        meta.className,
        className
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
