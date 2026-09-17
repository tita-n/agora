import { requireRole, prisma } from "@/lib/auth";
import { parseSessionPayload } from "@/lib/onboarding";
import { formatNaira } from "@/lib/money";
import { PaymentRowActions } from "./payment-actions";

export const dynamic = "force-dynamic";

/**
 * /admin/payments — the manual confirmation queue (admin role only,
 * server-side gated via requireRole; there is no client-side hiding here).
 *
 * Lists pending manual transfers with what YOU need to match them against a
 * bank statement: reference, amount, business name from the draft, age.
 * Confirm/Reject are POSTs to /api/admin/payments/* (which re-check role +
 * origin server-side — the buttons are convenience, not enforcement).
 */
interface PendingRow {
  id: string;
  reference: string;
  kind: string;
  status: string;
  amountKobo: number;
  createdAt: Date;
  businessDraft: { payload: unknown } | null;
  business: { name: string; subdomain: string } | null;
  submittedBy: { email: string | null };
}

function humanizeAge(createdAt: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function AdminPaymentsPage() {
  await requireRole(["admin"]);

  const payments = await prisma.pendingPayment.findMany({
    where: { status: { in: ["pending", "processing"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reference: true,
      kind: true,
      amountKobo: true,
      status: true,
      createdAt: true,
      businessDraft: { select: { payload: true } },
      business: { select: { name: true, subdomain: true } },
      submittedBy: { select: { email: true } }, // explicit select — never User.* (H-1)
    },
  });

  const rows = (payments as PendingRow[]).map((p) => {
    const draft = p.businessDraft ? parseSessionPayload(p.businessDraft.payload) : null;
    return {
      id: p.id,
      reference: p.reference,
      kind: p.kind as "signup" | "renewal",
      status: p.status,
      amountKobo: p.amountKobo,
      age: humanizeAge(p.createdAt),
      businessName: p.kind === "renewal" ? p.business?.name ?? "(deleted business)" : draft?.name ?? "(draft unreadable)",
      subdomain: p.kind === "renewal" ? p.business?.subdomain ?? "—" : draft?.subdomain ?? "—",
      payerEmail: p.submittedBy.email,
    };
  });

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">Payment confirmations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manual bank transfers waiting on you. Check each against your bank
          statement by the <span className="font-mono">reference</span>, then
          confirm — the business goes live the moment you do.
        </p>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">No payments waiting. 🎉 means no queue, not no sales.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Payer</th>
                  <th className="px-4 py-3 font-medium">Waiting</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(rows as typeof rows).map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{r.reference}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          r.kind === "renewal"
                            ? "bg-sky-50 text-sky-700 ring-sky-600/20"
                            : "bg-gray-100 text-gray-600 ring-gray-500/20"
                        }`}
                      >
                        {r.kind === "renewal" ? "renewal" : "new signup"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{r.businessName}</span>
                      <span className="block font-mono text-xs text-gray-400">{r.subdomain}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{formatNaira(r.amountKobo)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.payerEmail}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {r.age}
                      {r.status === "processing" && (
                        <span className="block text-amber-600">processing — stuck? investigate before retrying</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentRowActions id={r.id} disabled={r.status === "processing"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
