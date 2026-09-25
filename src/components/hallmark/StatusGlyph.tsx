import { CircleCheck, CircleDashed, CircleX, Hand } from "lucide-react";

export type Status = "pass" | "fail" | "pending" | "manual";

const META: Record<Status, { Icon: typeof CircleCheck; label: string; className: string }> = {
  pass: { Icon: CircleCheck, label: "verificado", className: "text-allow" },
  manual: { Icon: Hand, label: "marcado a mano", className: "text-accent" },
  fail: { Icon: CircleX, label: "falla", className: "text-deny" },
  pending: { Icon: CircleDashed, label: "sin datos", className: "text-neutral" },
};

/** Status is never colour alone: each state has its own glyph and an accessible label. */
export function StatusGlyph({ status, size = 18 }: { status: Status; size?: number }) {
  const { Icon, label, className } = META[status];
  return (
    <span className={`inline-flex shrink-0 ${className}`} role="img" aria-label={label} title={label}>
      <Icon size={size} aria-hidden />
    </span>
  );
}
