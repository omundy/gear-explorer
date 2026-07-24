import { openDB, type IDBPDatabase } from 'idb';
import type { ActivityCacheEntry } from './types';

// Client-side (browser) mirror of the server's activity cache
// (src/lib/activityCache.ts). The server-side JSON file is what
// /api/strava/sync writes to and what pages read for their first
// server-rendered paint, but it can disappear (server restart, ephemeral
// deploy filesystem) without warning. IndexedDB is per-browser and
// survives that, so GearDashboard.svelte prefers whichever of the two
// copies is newer and falls back to this one if the server has nothing -
// letting a returning user see their data instantly without re-syncing.
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
