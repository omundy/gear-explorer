import type { APIRoute } from 'astro';
import { getValidTokens } from '../../../lib/session';
import { fetchAllActivities, fetchAthlete, fetchGear } from '../../../lib/strava';
import { writeActivityCache } from '../../../lib/activityCache';
import { getUsage, recordCalls } from '../../../lib/apiUsage';
import type { StravaGearDetail } from '../../../lib/types';

// Fetches everything (athlete, every bike/shoe's detail, every activity)
// from Strava in one go and caches it - see activityCache.ts. Every other
// page reads from that cache instead of calling Strava, so this route is
// the only place that spends the daily call budget (apiUsage.ts).
export const GET: APIRoute = async ({ cookies, redirect }) => {
  const tokens = await getValidTokens(cookies);
  if (!tokens) return redirect('/');

  const usage = await getUsage(tokens.athleteId);
  if (usage.remaining <= 0) {
    return redirect('/dashboard?error=budget');
  }

  let calls = 0;

  const athlete = await fetchAthlete(tokens.access_token);
  calls++;

  const gearDetails: Record<string, StravaGearDetail> = {};
  for (const gear of [...athlete.bikes, ...athlete.shoes]) {
    gearDetails[gear.id] = await fetchGear(gear.id, tokens.access_token);
    calls++;
  }

  const { activities, calls: activityCalls } = await fetchAllActivities(tokens.access_token);
  calls += activityCalls;

  await writeActivityCache(tokens.athleteId, {
    athlete,
    gearDetails,
    activities,
    fetchedAt: new Date().toISOString(),
  });
  await recordCalls(tokens.athleteId, calls);

  return redirect('/dashboard?synced=1');
};
