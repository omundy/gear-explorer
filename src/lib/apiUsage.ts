import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Self-imposed budget to discourage unlimited "Refresh from Strava" clicks -
// well under Strava's actual app-wide limit (200/15min, 2000/day), so this
// is purely about not burning the shared budget on the person clicking
// Refresh over and over, not about avoiding a real Strava 429.
export const DAILY_CALL_LIMIT = 100;

const DATA_FILE = new URL('../../data/api-usage.json', import.meta.url);

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

async function readAll(): Promise<Record<string, UsageRecord>> {
  try {
    const raw = await readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, UsageRecord>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAll(all: Record<string, UsageRecord>): Promise<void> {
  await mkdir(dirname(DATA_FILE.pathname), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(all, null, 2));
}

function toUsage(used: number): Usage {
  return { used, remaining: Math.max(0, DAILY_CALL_LIMIT - used), limit: DAILY_CALL_LIMIT };
}

export async function getUsage(athleteId: number): Promise<Usage> {
  const all = await readAll();
  const record = all[athleteId];
  const used = record && record.date === today() ? record.count : 0;
  return toUsage(used);
}

/** Adds `calls` to today's count (resetting first if the stored count is from an earlier day). */
export async function recordCalls(athleteId: number, calls: number): Promise<Usage> {
  const all = await readAll();
  const record = all[athleteId];
  const used = record && record.date === today() ? record.count + calls : calls;
  all[athleteId] = { date: today(), count: used };
  await writeAll(all);
  return toUsage(used);
}
