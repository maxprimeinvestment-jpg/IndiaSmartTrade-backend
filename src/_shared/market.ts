import type { ISODate } from './common';

export const MarketCategory = {
  CURRENCY: 'CURRENCY',
  INDICES: 'INDICES',
  COMMODITY: 'COMMODITY',
  CRYPTO: 'CRYPTO',
  INDIAN_EQUITY: 'INDIAN_EQUITY',
  INDIAN_INDEX: 'INDIAN_INDEX',
} as const;
export type MarketCategory = (typeof MarketCategory)[keyof typeof MarketCategory];

export type MarketRegion = 'GLOBAL' | 'IN';
export type CurrencyCode = 'USD' | 'INR';

export type MarketHours = {
  open: string;
  close: string;
  tz: string;
  days: number[];
};

export const NSE_HOURS: MarketHours = {
  open: '09:15',
  close: '15:30',
  tz: 'Asia/Kolkata',
  days: [1, 2, 3, 4, 5],
};

export type Symbol = {
  code: string;
  displayName: string;
  category: MarketCategory;
  pipSize: number;
  digits: number;
  visible: boolean;
  region?: MarketRegion;
  currency?: CurrencyCode;
  lotSize?: number;
  contractSize?: number;
  hours?: MarketHours | null;
};

export type Quote = {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  changePct24h: number;
  timestamp: number;
};

export const OHLCInterval = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
} as const;
export type OHLCInterval = (typeof OHLCInterval)[keyof typeof OHLCInterval];

export type OHLC = {
  symbol: string;
  interval: OHLCInterval;
  startedAt: ISODate;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// ---- Market hours helpers (used by backend and both frontends) -----------

// NSE 2026 full-day equity closures. Refresh annually from
// https://www.nseindia.com/resources/exchange-communication-holidays
export const NSE_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  '2026-01-26',
  '2026-02-19',
  '2026-03-03',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-08-15',
  '2026-08-27',
  '2026-10-02',
  '2026-10-21',
  '2026-11-04',
  '2026-12-25',
]);

const HOLIDAYS_BY_YEAR: Record<number, ReadonlySet<string>> = {
  2026: NSE_HOLIDAYS_2026,
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  ymd: string;
  minutesOfDay: number;
};

function partsIn(tz: string, now: Date): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  let year = 0, month = 0, day = 0, hour = 0, minute = 0, weekday = 0;
  for (const p of fmt.formatToParts(now)) {
    switch (p.type) {
      case 'year': year = Number(p.value); break;
      case 'month': month = Number(p.value); break;
      case 'day': day = Number(p.value); break;
      case 'hour': hour = Number(p.value); break;
      case 'minute': minute = Number(p.value); break;
      case 'weekday': weekday = WEEKDAY_INDEX[p.value] ?? 0; break;
    }
  }
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, hour, minute, weekday, ymd, minutesOfDay: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isMarketOpen(hours: MarketHours | null | undefined, now: Date = new Date()): boolean {
  if (!hours) return true;
  const p = partsIn(hours.tz, now);
  if (!hours.days.includes(p.weekday)) return false;
  const holidays = HOLIDAYS_BY_YEAR[p.year];
  if (holidays && holidays.has(p.ymd)) return false;
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  return p.minutesOfDay >= open && p.minutesOfDay < close;
}

export function nextOpen(hours: MarketHours | null | undefined, now: Date = new Date()): Date | null {
  if (!hours) return null;
  for (let dayOffset = 0; dayOffset < 21; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86_400_000);
    const p = partsIn(hours.tz, probe);
    if (!hours.days.includes(p.weekday)) continue;
    const holidays = HOLIDAYS_BY_YEAR[p.year];
    if (holidays && holidays.has(p.ymd)) continue;
    const open = toMinutes(hours.open);
    const close = toMinutes(hours.close);
    if (dayOffset === 0 && p.minutesOfDay < open) {
      return zonedDate(p.year, p.month, p.day, hours.open, hours.tz);
    }
    if (dayOffset === 0 && p.minutesOfDay >= close) continue;
    if (dayOffset > 0) {
      return zonedDate(p.year, p.month, p.day, hours.open, hours.tz);
    }
    return null;
  }
  return null;
}

// Build a UTC Date from y/m/d + HH:MM in the given IANA tz. Works for
// IST (no DST); for DST zones it picks the offset valid at the target instant.
function zonedDate(year: number, month: number, day: number, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, h, m);
  const probeParts = partsIn(tz, new Date(utcGuess));
  // What does utcGuess look like in tz? Diff = offset.
  const probeUtcMillis = Date.UTC(
    probeParts.year,
    probeParts.month - 1,
    probeParts.day,
    probeParts.hour,
    probeParts.minute,
  );
  const offsetMs = probeUtcMillis - utcGuess;
  return new Date(utcGuess - offsetMs);
}

export function formatHoursIn(when: Date | null, tz: string): string | null {
  if (!when) return null;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(when);
}

export function formatNextOpenIST(when: Date | null): string | null {
  const s = formatHoursIn(when, 'Asia/Kolkata');
  return s ? `${s} IST` : null;
}

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  INR: '₹',
};
