import type {
  SessionData,
  StravaActivity,
  StravaAthlete,
  StravaGearDetail,
  StravaTokens,
} from './types';

// Strava's hard cap on per_page for any paginated endpoint.
const MAX_PER_PAGE = 200;

const WEB_BASE = 'https://www.strava.com';
const AUTHORIZE_URL = `${WEB_BASE}/oauth/authorize`;
const TOKEN_URL = `${WEB_BASE}/oauth/token`;
const API_BASE = `${WEB_BASE}/api/v3`;

// Scopes needed: read athlete profile + full activity history (activity:read
// only exposes activities the athlete marked public, activity:read_all gets
// everything regardless of visibility).
const SCOPES = 'read,profile:read_all,activity:read_all';

function getEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function buildAuthorizeUrl(redirectUri: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', getEnv('STRAVA_CLIENT_ID'));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('approval_prompt', 'auto');
  url.searchParams.set('scope', SCOPES);
  return url.toString();
}

// Strava includes an athlete summary in this response only on the initial
// code exchange (not on refresh) - this is our one chance to capture the
// athlete id/name without a separate GET /athlete call.
export async function exchangeCodeForTokens(code: string): Promise<SessionData> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: getEnv('STRAVA_CLIENT_ID'),
      client_secret: getEnv('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athleteId: data.athlete.id,
    firstname: data.athlete.firstname,
  };
}

export async function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: getEnv('STRAVA_CLIENT_ID'),
      client_secret: getEnv('STRAVA_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

/** Returns tokens unchanged if still valid, otherwise refreshes and returns the new set. */
export async function ensureFreshTokens(tokens: StravaTokens): Promise<StravaTokens> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Refresh a little early to avoid racing the expiry during the request.
  if (tokens.expires_at - nowSeconds > 60) {
    return tokens;
  }
  return refreshTokens(tokens.refresh_token);
}

async function stravaFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Strava API error on ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export function fetchAthlete(accessToken: string): Promise<StravaAthlete> {
  return stravaFetch<StravaAthlete>('/athlete', accessToken);
}

export function fetchGear(gearId: string, accessToken: string): Promise<StravaGearDetail> {
  return stravaFetch<StravaGearDetail>(`/gear/${gearId}`, accessToken);
}

export function fetchActivities(
  accessToken: string,
  { page = 1, perPage = 30 }: { page?: number; perPage?: number } = {},
): Promise<StravaActivity[]> {
  return stravaFetch<StravaActivity[]>(
    `/athlete/activities?page=${page}&per_page=${perPage}`,
    accessToken,
  );
}

/**
 * Pages through /athlete/activities at Strava's max page size until a short
 * page comes back. Used for the once-a-day full sync (see
 * /api/strava/sync) - everything after that is served from the local
 * cache, not re-fetched.
 */
export async function fetchAllActivities(
  accessToken: string,
): Promise<{ activities: StravaActivity[]; calls: number }> {
  const activities: StravaActivity[] = [];
  let page = 1;
  let calls = 0;
  while (true) {
    const batch = await fetchActivities(accessToken, { page, perPage: MAX_PER_PAGE });
    calls++;
    activities.push(...batch);
    if (batch.length < MAX_PER_PAGE) break;
    page++;
  }
  return { activities, calls };
}
