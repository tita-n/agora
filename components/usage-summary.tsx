import { calculateOverageKobo, overageLines, type UsageInputs } from "@/lib/billing/overage";
import { formatNaira } from "@/lib/money";

/**
 * Usage & fair-use summary card (Phase 2, server component — no client JS).
 *
 * The critical honesty rule from the billing design: a stored 0 can mean
 * "measured, and it is 0", "nothing has measured it yet", or "a previous
 * value we keep because no new source answered". The UsageRecord.sources
 * provenance (written by the snapshot cron; null = hand-seeded via SQL)
 * decides which of those the owner sees — a misleading "0 GB · measured"
 * must never render, because an owner reconciling a bill trusts that label.
 */
export interface UsageRecordView {
  periodStart: Date;
  periodEnd: Date;
  bandwidthGb: number;
  blobStorageGb: number;
  blobTransferGb: number;
  overageKobo: number;
  sources: unknown;
}

type Sources = Partial<Record<"bandwidthGb" | "blobStorageGb" | "blobTransferGb", string>>;

function metric(
  gb: number,
  source: string | undefined,
  handSeeded: boolean
): { value: string; tag: string } {
  if (source === "api") return { value: fmt(gb), tag: "measured · Vercel Analytics" };
  if (source === "blob-sdk") return { value: fmt(gb), tag: "measured · Blob store" };
  if (source === "kept")
    return { value: fmt(gb), tag: "last known value (not re-measured this run)" };
  if (handSeeded) return { value: fmt(gb), tag: "manual entry" };
  return { value: "Not yet measured", tag: "" };
}

function fmt(gb: number): string {
  if (!Number.isFinite(gb) || gb <= 0) return "0 GB";
  return `${gb < 1 ? gb.toFixed(4).replace(/0+$/, "") : gb.toFixed(2)} GB`;
}

const MONTH = { month: "short", day: "numeric", timeZone: "UTC" } as const;
function periodLabel(start: Date, end: Date): string {
  const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-NG", MONTH).format(d);
  const year = new Intl.DateTimeFormat("en-NG", { year: "numeric", timeZone: "UTC" }).format(end);
  return `${fmtDay(start)} – ${fmtDay(end)} ${year}`;
}

export function UsageSummary({ record }: { record: UsageRecordView | null }) {
  if (!record) {
    return (
      <section className="rounded-md border border-rule bg-card p-5">
        <h2 className="text-sm font-semibold text-ink">Usage &amp; Fair Use</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Nothing has been measured for this period yet. Usage is snapshotted
          automatically each morning (06:55 UTC); it stays “not measured”
          until the first snapshot runs, and bandwidth/transfer additionally
          require Vercel&apos;s Analytics access to be configured on the
          platform.
        </p>
      </section>
    );
  }

  const handSeeded = record.sources == null;
  const sources = (record.sources ?? {}) as Sources;
  const usage: UsageInputs = {
    bandwidthGb: record.bandwidthGb,
    blobStorageGb: record.blobStorageGb,
    blobTransferGb: record.blobTransferGb,
  };
  const breakdown = calculateOverageKobo(usage);
  const lines = overageLines(usage, breakdown);
  const anyUnmeasured =
    (handSeeded && record.bandwidthGb === 0) ||
    (handSeeded && record.blobTransferGb === 0) ||
    sources.bandwidthGb === "not-measured" ||
    sources.blobTransferGb === "not-measured";

  const rows = [
    {
      label: "Page bandwidth",
      included: "6 GB / month",
      ...metric(record.bandwidthGb, sources.bandwidthGb, handSeeded),
    },
    {
      label: "File storage",
      included: "5 MB",
      ...metric(record.blobStorageGb, sources.blobStorageGb, handSeeded),
    },
    {
      label: "File downloads",
      included: "2 GB / month",
      ...metric(record.blobTransferGb, sources.blobTransferGb, handSeeded),
    },
  ];

  return (
    <section className="rounded-md border border-rule bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Usage &amp; Fair Use</h2>
        <span className="text-xs text-ink-faint">
          {periodLabel(new Date(record.periodStart), new Date(record.periodEnd))}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-md bg-paper px-3 py-2">
            <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              {r.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{r.value}</dd>
            <dd className="text-[11px] text-ink-muted">
              {r.tag || `incl. ${r.included}`}
              {r.tag && (
                <span className="block text-ink-faint">included: {r.included}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-md border border-rule/60 px-3 py-2 text-sm">
        {lines.length === 0 ? (
          <p className="text-ink-muted">
            <span className="font-semibold text-ink">₦0 overage</span> —{" "}
            {anyUnmeasured
              ? "within Fair Use limits for the values measured so far (some metrics are not measured yet, so this can still change)."
              : "usage is within the Fair Use limits, so there is nothing to add to the plan fee."}
          </p>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Overage this period
            </p>
            <ul className="mt-1 divide-y divide-gray-50">
              {lines.map((l) => (
                <li key={l.label} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-ink-muted">{l.label}</span>
                  <span className="font-medium text-ink">{formatNaira(l.kobo)}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 pt-1">
                <span className="font-semibold text-ink">Total overage</span>
                <span className="font-semibold text-ink">
                  {formatNaira(breakdown.totalOverageKobo)}
                </span>
              </li>
            </ul>
            <p className="mt-1 text-[11px] text-ink-faint">
              This is added on top of your plan fee when the renewal is
              quoted; the same breakdown appears in your renewal email.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
