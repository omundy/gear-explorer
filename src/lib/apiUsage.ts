import type { AstroCookies } from 'astro';

// Self-imposed budget to discourage unlimited "Refresh from Strava" clicks -
// well under Strava's actual app-wide limit (200/15min, 2000/day), so this
// is purely about not burning the shared budget on the person clicking
// Refresh over and over, not about avoiding a real Strava 429. Tracked in a
// cookie rather than a server-side file - there's no persistent filesystem
// to write to on a serverless host (Vercel), and the value being
// user-editable via devtools is fine for a governor that isn't a security
// boundary in the first place.
export const DAILY_CALL_LIMIT = 100;

const COOKIE_NAME = 'api_usage';

interface UsageRecord {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

export interface Usage {
  used: number;
  remaining: number;
  limit: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toUsage(used: number): Usage {
  return { used, remaining: Math.max(0, DAILY_CALL_LIMIT - used), limit: DAILY_CALL_LIMIT };
}

function readRecord(cookies: AstroCookies): UsageRecord | null {
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsageRecord;
  } catch {
    return null;
  }
}

function writeRecord(cookies: AstroCookies, record: UsageRecord): void {
  cookies.set(COOKIE_NAME, JSON.stringify(record), {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    // Resets daily anyway - no need to keep it around longer than a day.
    maxAge: 60 * 60 * 24,
  });
}

export function getUsage(cookies: AstroCookies): Usage {
  const record = readRecord(cookies);
  const used = record && record.date === today() ? record.count : 0;
  return toUsage(used);
}

/** Adds `calls` to today's count (resetting first if the stored count is from an earlier day). */
export function recordCalls(cookies: AstroCookies, calls: number): Usage {
  const record = readRecord(cookies);
  const used = record && record.date === today() ? record.count + calls : calls;
  writeRecord(cookies, { date: today(), count: used });
  return toUsage(used);
}
