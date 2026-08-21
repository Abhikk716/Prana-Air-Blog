import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';

const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const attemptCache = new Map(); // ip -> { count, firstAttempt }

function isLockedOut(ip) {
  const entry = attemptCache.get(ip);
  if (!entry) return false;

  if (Date.now() - entry.firstAttempt > LOCKOUT_WINDOW_MS) {
    attemptCache.delete(ip);
    return false;
  }

  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const entry = attemptCache.get(ip);
  const now = Date.now();

  if (!entry || now - entry.firstAttempt > LOCKOUT_WINDOW_MS) {
    attemptCache.set(ip, { count: 1, firstAttempt: now });
  } else {
    entry.count += 1;
  }

  // Prevent unbounded growth of the cache
  if (attemptCache.size > 5000) {
    for (const [key, value] of attemptCache.entries()) {
      if (now - value.firstAttempt > LOCKOUT_WINDOW_MS) {
        attemptCache.delete(key);
      }
    }
  }
}

function clearAttempts(ip) {
  attemptCache.delete(ip);
}

// Constant-time string comparison to avoid leaking match-length via timing.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal-length buffers so failure timing
    // doesn't reveal the correct credential length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown-ip';

    if (isLockedOut(ip)) {
      return Response.json(
        { success: false, error: 'Too many failed attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const { username, password } = await request.json();

    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!expectedUsername || !expectedPassword) {
      console.error('Missing ADMIN_USERNAME or ADMIN_PASSWORD in environment variables.');
      return Response.json(
        { success: false, error: 'Server configuration error.' },
        { status: 500 }
      );
    }

    const usernameMatches = typeof username === 'string' && safeEqual(username, expectedUsername);
    const passwordMatches = typeof password === 'string' && safeEqual(password, expectedPassword);

    if (usernameMatches && passwordMatches) {
      clearAttempts(ip);

      // Set secure HTTP-only cookie
      const cookieStore = await cookies();
      cookieStore.set('admin_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
      });

      return Response.json({ success: true });
    } else {
      recordFailedAttempt(ip);
      return Response.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return Response.json(
      { success: false, error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
