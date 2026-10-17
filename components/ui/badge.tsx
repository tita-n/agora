export type BadgeTone = "neutral" | "success" | "warn" | "danger" | "brass";
const tones: Record<BadgeTone, string> = {
  neutral: "border-rule-strong text-ink-muted",
  success: "border-success/40 text-success",
  warn: "border-warn/40 text-warn",
  danger: "border-danger/40 text-danger",
  brass: "border-brass/40 text-brass",
};
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active": case "verified": case "published": case "paid": case "confirmed": return "success";
    case "past_due": case "pending": case "in_review": case "unverified": case "await_confirmation": return "warn";
    case "rejected": case "expired": case "suspended": case "failed": return "danger";
    default: return "neutral";
  }
}
