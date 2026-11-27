export type DateRangePreset = '7d' | '30d' | '90d' | '12m' | 'custom';
export type Granularity = 'day' | 'week' | 'month';

export interface ResolvedRange {
  preset: DateRangePreset;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  days: number;
}

export function resolveDateRange(
  range?: string,
  startDateStr?: string,
  endDateStr?: string,
): ResolvedRange {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);

  if (range === 'custom' && startDateStr && endDateStr) {
    const parsedStart = new Date(startDateStr);
    const parsedEnd = new Date(endDateStr);
    if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime()) && parsedStart <= parsedEnd) {
      parsedStart.setUTCHours(0, 0, 0, 0);
      parsedEnd.setUTCHours(23, 59, 59, 999);
      const durationMs = parsedEnd.getTime() - parsedStart.getTime() + 1;
      const days = Math.max(1, Math.round(durationMs / 86400000));
      const prevEnd = new Date(parsedStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs + 1);
      return { preset: 'custom', start: parsedStart, end: parsedEnd, prevStart, prevEnd, days };
    }
  }

  let days = 30;
  let preset: DateRangePreset = '30d';
  if (range === '7d') {
    days = 7;
    preset = '7d';
  } else if (range === '90d') {
    days = 90;
    preset = '90d';
  } else if (range === '12m') {
    days = 365;
    preset = '12m';
  }

  const start = new Date(end.getTime() - (days - 1) * 86400000);
  start.setUTCHours(0, 0, 0, 0);

  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  prevStart.setUTCHours(0, 0, 0, 0);

  return { preset, start, end, prevStart, prevEnd, days };
}

export function formatBucketKey(date: Date, granularity: Granularity): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');

  if (granularity === 'month') {
    return `${y}-${m}`;
  }
  if (granularity === 'week') {
    // ISO week start (Monday)
    const copy = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
    const dayOfWeek = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() - dayOfWeek + 1);
    const wy = copy.getUTCFullYear();
    const wm = String(copy.getUTCMonth() + 1).padStart(2, '0');
    const wd = String(copy.getUTCDate()).padStart(2, '0');
    return `${wy}-${wm}-${wd}`;
  }
  return `${y}-${m}-${d}`;
}

export function enumerateBuckets(start: Date, end: Date, granularity: Granularity): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(start.getTime());
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    const key = formatBucketKey(cursor, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    if (granularity === 'month') {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return keys;
}

export function computeDeltaPct(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
