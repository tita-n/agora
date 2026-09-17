/**
 * Human-readable, collision-safe reference generator for the manual provider.
 *
 * Format: `AGORA-` + 6 chars from a 32-char alphabet with visually ambiguous
 * characters removed (no 0/O, 1/I/L) so a payer can transcribe it from a
 * screenshot or a WhatsApp message without error. Kept pure (the uniqueness
 * predicate is injected) so it is unit-testable without a database.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I,L,O,0,1
export const REFERENCE_RE = /^AGORA-[A-HJ-KM-NP-Z2-9]{6}$/;

/** crypto-based pick without modulo bias. */
function randomChar(): string {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  // 256 % 32 === 0, so this modulo is bias-free for this alphabet length.
  return ALPHABET[bytes[0] % ALPHABET.length];
}

export function makeReference(): string {
  let body = "";
  for (let i = 0; i < 6; i++) body += randomChar();
  return `AGORA-${body}`;
}

/**
 * Generate a reference, retrying on collision. `exists` should query the
 * store of live references (PendingPayment). Throws rather than return a
 * possibly-duplicate value — 6 chars over 32^2 ≈ 1e9 space means a collision
 * is already astronomically unlikely; repeated collisions mean something is
 * wrong and the caller must not silently proceed.
 */
export async function generateReference(
  exists: (ref: string) => Promise<boolean>,
  maxAttempts = 8
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const ref = makeReference();
    if (!(await exists(ref))) return ref;
  }
  throw new Error("Could not allocate a unique payment reference — retry shortly.");
}
