import type { AstroCookies } from 'astro';
import { ensureFreshTokens } from './strava';
import type { SessionData } from './types';

const COOKIE_NAME = 'strava_session';

export function readTokens(cookies: AstroCookies): SessionData | null {
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function writeTokens(cookies: AstroCookies, session: SessionData): void {
  cookies.set(COOKIE_NAME, JSON.stringify(session), {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    // Strava refresh tokens are long-lived; keep the cookie around for 90 days.
    maxAge: 60 * 60 * 24 * 90,
  });
}

export function clearTokens(cookies: AstroCookies): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

/**
 * Reads the session from the cookie, transparently refreshing (and
 * re-persisting) the access token if it's expired or close to it. Refresh
 * responses don't include athleteId/firstname (only the initial code
 * exchange does), so those are carried over from the existing session.
 * Returns null if the user has no session at all.
 */
export async function getValidTokens(cookies: AstroCookies): Promise<SessionData | null> {
  const session = readTokens(cookies);
  if (!session) return null;
  const fresh = await ensureFreshTokens(session);
  if (fresh === session) return session;
  const updated: SessionData = { ...session, ...fresh };
  writeTokens(cookies, updated);
  return updated;
}
