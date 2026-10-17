import { env } from "@/lib/env";

/**
 * Renewal-reminder email via Resend. Deliberately SOFT:
 *  - If RESEND_API_KEY / RESEND_FROM_EMAIL are unset, this only logs the
 *    message (and returns delivered:false). The cron job must not fail — or
 *    block on email provider selection — so an unconfigured sender is a
 *    warning, not an error. (Ground rule: "log it clearly for now".)
 *  - On any Resend error we log + return, never throw, so one bad address
 *    can't abort a whole batch of renewals.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const key = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.log(
      `[email:not-configured] would send to ${input.to}: "${input.subject}" ` +
        `(set RESEND_API_KEY + RESEND_FROM_EMAIL to actually deliver)`
    );
    return { delivered: false, reason: "email provider not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[email:resend-error] ${res.status} ${detail.slice(0, 200)}`);
      return { delivered: false, reason: `Resend ${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    console.warn(`[email:error] ${err instanceof Error ? err.message : err}`);
    return { delivered: false, reason: "network" };
  }
}

/** Minimal, XSS-safe email shell: all interpolated values are plain text. */
export function reminderEmailHtml(params: {
  businessName: string;
  amountKobo: string;
  reference: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  contactUrl: string;
  /** Itemized renewal bill (Phase 2): when present, rendered between the
   * greeting and the bank table so the owner sees WHY the total is what it
   * is. Plain labels, pre-formatted amounts — this function only escapes. */
  breakdownLines?: { label: string; amount: string }[];
}): string {
  const e = (s: string) =>
    s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
  <h2>Your Agora site renews soon</h2>
  <p>Hi — the <strong>${e(params.businessName)}</strong> Agora subscription
  (${params.amountKobo}) is coming up. To keep your site live, send the
  amount to the account below with your reference as the transfer note.</p>
  ${
    params.breakdownLines
      ? `<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px">
    <tr><td colspan="2" style="padding:6px 12px 2px;color:#6b7280;text-align:left">Your bill:</td></tr>
    ${params.breakdownLines
      .map(
        (l) =>
          `<tr><td style="padding:2px 12px;text-align:left">${e(l.label)}</td><td style="padding:2px 12px;text-align:right">${e(l.amount)}</td></tr>`
      )
      .join("")}
    <tr><td style="padding:6px 12px 2px;font-weight:600;text-align:left">Total</td><td style="padding:6px 12px 2px;font-weight:600;text-align:right">${e(params.amountKobo)}</td></tr>
  </table>`
      : ""
  }
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 12px;color:#6b7280">Bank</td><td style="padding:6px 12px"><strong>${e(params.bankName)}</strong></td></tr>
    <tr><td style="padding:6px 12px;color:#6b7280">Account name</td><td style="padding:6px 12px"><strong>${e(params.accountName)}</strong></td></tr>
    <tr><td style="padding:6px 12px;color:#6b7280">Account number</td><td style="padding:6px 12px"><strong>${e(params.accountNumber)}</strong></td></tr>
    <tr><td style="padding:6px 12px;color:#6b7280">Reference</td><td style="padding:6px 12px"><strong>${e(params.reference)}</strong></td></tr>
  </table>
  <p>We activate renewal the same day we confirm the transfer. Questions?
  Reply to this email or reach us at <a href="${e(params.contactUrl)}">${e(params.contactUrl)}</a>.</p>
</div>`;
}
