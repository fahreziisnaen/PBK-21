/**
 * The caller's address, as far as it can be trusted.
 *
 * Takes the RIGHTMOST entry of `X-Forwarded-For`, not the leftmost. Caddy's
 * `reverse_proxy` *appends* the real peer address to whatever the client sent,
 * and only sanitises the header when `trusted_proxies` is configured. So a
 * client sending `X-Forwarded-For: 1.2.3.4` produces `1.2.3.4, <real ip>` —
 * reading the leftmost entry meant reading a value the attacker chose.
 *
 * Three things were wrong with that: the 20-per-IP login limit could be
 * bypassed by rotating a header; `AuthEvent.ip`, which a SUPERADMIN reads to
 * answer "where did this come from", could be set to any address including an
 * innocent third party's; and an attacker could deliberately burn another
 * address's budget, locking out a whole school behind one NAT.
 *
 * The rightmost hop is the one our own proxy appended, so it is the only entry
 * a client cannot write. With no proxy in front, the header is absent and this
 * returns null rather than guessing.
 */
export function clientIpFrom(headers: { get: (name: string) => string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) return null;
  const hops = forwarded
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.length > 0 ? (hops[hops.length - 1] ?? null) : null;
}
