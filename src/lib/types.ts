// Strava API shapes (subset of fields we actually use).
// Full reference: https://developers.strava.com/docs/reference/

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
}

// What we store in the session cookie: the OAuth tokens plus the athlete
// identity, captured once at login (Strava only returns the athlete summary
// on the initial code exchange, not on token refresh - see
// exchangeCodeForTokens). Having athleteId/firstname here means most pages
// never need to call GET /athlete just to know who's logged in.
export interface SessionData extends StravaTokens {
  athleteId: number;
  firstname: string;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
  bikes: StravaGearSummary[];
  shoes: StravaGearSummary[];
}

export interface StravaGearSummary {
  id: string;
  primary: boolean;
  name: string;
  resource_state: number;
  distance: number; // meters
}

export interface StravaGearDetail extends StravaGearSummary {
  brand_name?: string;
  model_name?: string;
  frame_type?: number;
  description?: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  gear_id: string | null;
  average_speed: number;
}

// A full local snapshot of one athlete's Strava data, fetched once via
// /api/strava/sync and read from thereafter - see src/lib/activityCache.ts.
export interface ActivityCacheEntry {
  athlete: StravaAthlete;
  gearDetails: Record<string, StravaGearDetail>;
  activities: StravaActivity[];
  fetchedAt: string; // ISO timestamp of when this snapshot was fetched
}
