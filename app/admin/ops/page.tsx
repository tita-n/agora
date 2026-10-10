import { requireRole } from "@/lib/auth";
import { UserNav } from "@/components/user-nav";
import { RunButton } from "./run-button";

export const dynamic = "force-dynamic";

/**
 * /admin/ops — cron console (testing convenience, admin-gated).
 *
 * Each button POSTs a job name to /api/admin/ops/run, which calls the
 * cron's own HTTP route on this deployment's origin with the same bearer
 * header Vercel's scheduler uses — so what you see here is exactly what
 * the schedule runs, not a parallel implementation. All four jobs are
 * idempotent-safe to trigger (upserts + dedup guards), which is the
 * property that makes this page exist at all.
 *
 * This does NOT affect when Vercel's scheduler fires (see vercel.json);
 * it's a manual "run once, now" — and the summary each cron already
 * returns is shown inline, which is the whole point for browser testing.
 */
const JOBS: {
  job: string;
  title: string;
  schedule: string;
  what: string;
}[] = [
  {
    job: "usage-snapshot",
    title: "Usage snapshot",
    schedule: "daily · 06:55 UTC",
    what: "Upserts this period's UsageRecord per active/past-due business: exact Blob storage, Analytics bandwidth when available (kept-not-zeroed otherwise), then recomputes stored overage.",
  },
  {
    job: "renewal-reminders",
    title: "Renewal reminders",
    schedule: "daily · 07:00 UTC",
    what: "For businesses due within 3 days: mints the renewal PendingPayment (plan fee + itemized overage) and emails the owner bank instructions. Never double-quotes while a live row exists.",
  },
  {
    job: "past-due-sweep",
    title: "Past-due sweep",
    schedule: "daily · 07:15 UTC",
    what: "Flips businesses whose nextBillingDate passed >5 days ago without confirmation to past_due. Sites are never taken down.",
  },
  {
    job: "dev-payouts",
    title: "Dev payouts",
    schedule: "monthly · 06:00 UTC on the 1st",
    what: "Recomputes each developer's owed DevPayout row for the previous calendar month from confirmed payments (70% of theme price). Paid rows are never touched.",
  },
];

export default async function AdminOpsPage() {
  await requireRole(["admin"]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <UserNav />
        <h1 className="text-2xl font-bold text-gray-900">Operations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manual triggers for the background jobs — for testing through the
          browser. This is <span className="font-semibold">not</span> the
          schedule: the crons keep running on their own (
          <span className="font-mono text-xs">vercel.json</span>), and a run
          here just executes the same endpoint once, now.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4">
          {JOBS.map((j) => (
            <section
              key={j.job}
              className="rounded-lg border border-gray-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">{j.title}</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-500">
                  {j.schedule}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">{j.what}</p>
              <RunButton job={j.job} label={j.title} />
            </section>
          ))}
        </div>

        <p className="mt-6 text-[11px] text-gray-400">
          Results shown here are live only in this tab — each cron also logs
          its full summary to the platform logs, which is the durable record.
        </p>
      </div>
    </main>
  );
}
