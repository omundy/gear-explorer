import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ActivityCacheEntry } from './types';

// Flat-file JSON cache. Populated by /api/strava/sync and read from by
// every other page - this is the entire mechanism that lets
// pagination/sorting/filtering happen without spending more of the daily
// API call budget (see apiUsage.ts).
const DATA_FILE = new URL('../../data/strava-cache.json', import.meta.url);

async function readAll(): Promise<Record<string, ActivityCacheEntry>> {
  try {
    const raw = await readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, ActivityCacheEntry>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAll(all: Record<string, ActivityCacheEntry>): Promise<void> {
  await mkdir(dirname(DATA_FILE.pathname), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(all, null, 2));
}

export async function readActivityCache(athleteId: number): Promise<ActivityCacheEntry | null> {
  const all = await readAll();
  return all[athleteId] ?? null;
}

export async function writeActivityCache(athleteId: number, entry: ActivityCacheEntry): Promise<void> {
  const all = await readAll();
  all[athleteId] = entry;
  await writeAll(all);
}
