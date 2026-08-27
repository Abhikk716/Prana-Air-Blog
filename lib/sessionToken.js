import { createHmac, timingSafeEqual } from 'crypto';

// Signs session tokens so the admin_session cookie can't just be guessed or
// typed in by hand — the previous implementation stored the literal string
// "authenticated" as the cookie value, so anyone could set
// `admin_session=authenticated` themselves and get full admin access without
// ever knowing the username/password. A token here is `<expiry>.<hmac>`;
// the hmac is only reproducible with SESSION_SECRET, which never leaves the
// server, so a forged or tampered value fails verification.
function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set. Add it to your .env file.');
  }
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSessionToken(ttlMs = 24 * 60 * 60 * 1000) {
  const payload = String(Date.now() + ttlMs);
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;

  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!payload || !signature) return false;

  let expected;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}
