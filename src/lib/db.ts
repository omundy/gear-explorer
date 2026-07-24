import { openDB, type IDBPDatabase } from 'idb';
import type { ActivityCacheEntry } from './types';

// The only place a synced Strava snapshot is stored - there is no
// server-side copy. /api/strava/sync returns the fresh data as JSON;
// GearDashboard.svelte writes it here and reads it back on later visits,
// so a returning user sees their data instantly without re-syncing.
const DB_NAME = 'gear-explorer';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
}

export async function getSnapshot(athleteId: number): Promise<ActivityCacheEntry | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, athleteId);
}

export async function putSnapshot(athleteId: number, entry: ActivityCacheEntry): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, entry, athleteId);
}
