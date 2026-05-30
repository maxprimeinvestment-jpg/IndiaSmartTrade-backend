import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMarketProvider } from './base';
import { isMarketOpen } from '@shared/market';
import { SYMBOLS, type SymbolDef } from '../symbols';

const NSE_BASE = 'https://www.nseindia.com';
const POLL_INTERVAL_MS = 3_000;
const COOKIE_TTL_MS = 10 * 60 * 1000;
const FAILURE_THRESHOLD = 5;
const REQUEST_TIMEOUT_MS = 8_000;

// Each query returns the index + all constituent stocks in one response,
// so 2 HTTP calls per cycle cover NIFTY 50 + BANK NIFTY + 15 equities.
const INDEX_QUERIES: ReadonlyArray<{ nseIndex: string; ourCode: string }> = [
  { nseIndex: 'NIFTY 50', ourCode: 'NIFTY50' },
  { nseIndex: 'NIFTY BANK', ourCode: 'BANKNIFTY' },
];

const NSE_EQUITY_CODES = new Set([
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'SBIN', 'ITC', 'BHARTIARTL', 'KOTAKBANK', 'LT',
  'AXISBANK', 'MARUTI', 'HCLTECH', 'BAJFINANCE', 'ASIANPAINT',
]);

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/market-data/live-equity-market',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

type NseIndexResponse = {
  name: string;
  data: Array<{
    symbol: string;
    lastPrice: number;
    open?: number;
    dayHigh?: number;
    dayLow?: number;
    previousClose?: number;
    change?: number;
    pChange?: number;
  }>;
  timestamp?: string;
};

@Injectable()
export class NseMarketProvider extends BaseMarketProvider {
  readonly providerName = 'nse';

  private cookieHeader: string | null = null;
  private cookieFetchedAt = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private inFallback = false;
  private stopped = false;

  private readonly handled: readonly SymbolDef[];

  constructor(config: ConfigService) {
    super(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', 'NseMarketProvider');
    this.handled = SYMBOLS.filter((s) => {
      if (s.region !== 'IN') return false;
      if (NSE_EQUITY_CODES.has(s.code)) return true;
      return INDEX_QUERIES.some((q) => q.ourCode === s.code);
    });
  }

  override get symbols(): readonly SymbolDef[] {
    return this.handled;
  }

  protected async start() {
    try {
      await this.warmupCookies();
    } catch (e) {
      this.logger.warn(`Cookie warmup failed: ${(e as Error).message} — will retry on next poll`);
    }
    this.pollTimer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS);
    void this.pollOnce();
  }

  protected async stop() {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
  }

  // ---- Cookie warmup ----------------------------------------------------
  private async warmupCookies() {
    const res = await this.fetchWithTimeout(`${NSE_BASE}/`, { headers: BROWSER_HEADERS });
    if (!res.ok && res.status !== 304) {
      throw new Error(`Warmup HTTP ${res.status}`);
    }
    const setCookies = readSetCookieHeaders(res.headers);
    if (setCookies.length === 0) throw new Error('No Set-Cookie returned');
    this.cookieHeader = setCookies.map((c) => c.split(';', 1)[0]).join('; ');
    this.cookieFetchedAt = Date.now();
    this.logger.log('NSE cookie jar refreshed');
  }

  private async ensureCookies() {
    if (!this.cookieHeader || Date.now() - this.cookieFetchedAt > COOKIE_TTL_MS) {
      await this.warmupCookies();
    }
  }

  // ---- Polling cycle ----------------------------------------------------
  private async pollOnce() {
    if (this.stopped) return;

    const anyOpen = this.handled.some((s) => isMarketOpen(s.hours));
    if (!anyOpen) {
      if (this.inFallback) this.stopFallback();
      return;
    }

    try {
      await this.ensureCookies();
      for (const q of INDEX_QUERIES) {
        await this.fetchIndex(q.nseIndex, q.ourCode);
      }
      this.consecutiveFailures = 0;
      if (this.inFallback) this.stopFallback();
    } catch (err) {
      this.consecutiveFailures += 1;
      this.logger.warn(`Poll failed (${this.consecutiveFailures}): ${(err as Error).message}`);
      this.cookieFetchedAt = 0;
      if (this.consecutiveFailures >= FAILURE_THRESHOLD && !this.inFallback) {
        this.logger.warn('NSE degraded — switching Indian symbols to mock random walk');
        this.startFallback();
      }
    }
  }

  private async fetchIndex(nseIndex: string, ourIndexCode: string) {
    const url = `${NSE_BASE}/api/equity-stockIndices?index=${encodeURIComponent(nseIndex)}`;
    const res = await this.fetchWithTimeout(url, {
      headers: { ...BROWSER_HEADERS, Cookie: this.cookieHeader! },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${nseIndex}`);
    const body = (await res.json()) as NseIndexResponse;
    if (!body?.data?.length) throw new Error(`Empty data for ${nseIndex}`);

    for (const row of body.data) {
      let ourCode: string | null = null;
      if (row.symbol === nseIndex) {
        ourCode = ourIndexCode;
      } else if (NSE_EQUITY_CODES.has(row.symbol)) {
        ourCode = row.symbol;
      }
      if (!ourCode) continue;
      if (!this.handled.find((s) => s.code === ourCode)) continue;

      const last = Number(row.lastPrice);
      if (!Number.isFinite(last) || last <= 0) continue;
      await this.publishTick({
        symbol: ourCode,
        last,
        changePct24h: Number(row.pChange) || 0,
        timestamp: Date.now(),
      });
    }
  }

  // ---- Random-walk fallback --------------------------------------------
  private startFallback() {
    if (this.fallbackTimer || this.stopped) return;
    this.inFallback = true;
    this.fallbackTimer = setInterval(() => {
      for (const sym of this.handled) {
        const prev = this.state.get(sym.code);
        if (!prev) continue;
        const drift = sym.volatility * sym.pipSize * (Math.random() * 2 - 1);
        const last = clamp(prev.last + drift, sym.startPrice * 0.7, sym.startPrice * 1.3);
        void this.publishTick({ symbol: sym.code, last });
      }
    }, 1_000);
  }

  private stopFallback() {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
    this.inFallback = false;
    this.logger.log('NSE recovered — back to live polling');
  }

  // ---- HTTP helper ------------------------------------------------------
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function readSetCookieHeaders(headers: Headers): string[] {
  const native = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof native === 'function') return native.call(headers);
  const out: string[] = [];
  headers.forEach((v, k) => {
    if (k.toLowerCase() === 'set-cookie') out.push(v);
  });
  return out;
}
