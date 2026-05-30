import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { BaseMarketProvider } from './base';
import { SYMBOLS, type SymbolDef } from '../symbols';

const WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';
const HEARTBEAT_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Twelve Data → IndiaSmartTrade symbol mapping. Twelve Data uses BASE/QUOTE format
 * for forex, BTC/USD for crypto, and ticker codes for indices/commodities.
 * Anything not present here falls back to the random walk via Mock.
 */
const SYMBOL_MAP: Record<string, string> = {
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD',
  GOLD: 'XAU/USD',
  OIL: 'WTI/USD',
  BTCUSD: 'BTC/USD',
  ETHUSD: 'ETH/USD',
  // Indices vary by Twelve Data plan; covered by mock fallback.
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]),
);

type TwelveDataPriceEvent = {
  event: 'price';
  symbol: string;
  currency_base?: string;
  currency_quote?: string;
  exchange?: string;
  type?: string;
  timestamp: number;
  price: number;
  bid?: number;
  ask?: number;
  day_volume?: number;
};

type TwelveDataMessage =
  | TwelveDataPriceEvent
  | { event: 'subscribe-status' | 'heartbeat'; status?: string; [k: string]: unknown };

@Injectable()
export class TwelveDataMarketProvider extends BaseMarketProvider {
  readonly providerName = 'twelvedata';
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private mockInterval: NodeJS.Timeout | null = null;
  private readonly apiKey: string;
  private readonly symbolFilter?: (s: SymbolDef) => boolean;
  private closed = false;

  constructor(config: ConfigService, symbolFilter?: (s: SymbolDef) => boolean) {
    super(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', 'TwelveDataProvider');
    this.apiKey = config.get<string>('MARKET_API_KEY') ?? '';
    this.symbolFilter = symbolFilter;
  }

  override get symbols(): readonly SymbolDef[] {
    return this.symbolFilter ? SYMBOLS.filter(this.symbolFilter) : SYMBOLS;
  }

  /** Symbols Twelve Data covers via WebSocket (a subset of `this.symbols`). */
  private get mappedSymbols(): readonly SymbolDef[] {
    return this.symbols.filter((s) => SYMBOL_MAP[s.code]);
  }

  /** Symbols we own but Twelve Data doesn't cover — driven by random walk. */
  private get fallbackSymbols(): readonly SymbolDef[] {
    return this.symbols.filter((s) => !SYMBOL_MAP[s.code]);
  }

  protected async start() {
    if (!this.apiKey) {
      this.logger.warn('MARKET_API_KEY missing — running fallback only.');
    }
    this.connect();
    this.startFallbackLoop();
  }

  protected async stop() {
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.mockInterval) clearInterval(this.mockInterval);
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
  }

  // ---- WebSocket lifecycle ----------------------------------------------
  private connect() {
    if (this.closed || !this.apiKey) return;
    const url = `${WS_URL}?apikey=${encodeURIComponent(this.apiKey)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempt = 0;
      const params = this.mappedSymbols.map((s) => SYMBOL_MAP[s.code]).join(',');
      ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: params } }));
      this.logger.log(`WS connected, subscribed to ${this.mappedSymbols.length} symbols`);
      this.startHeartbeat();
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as TwelveDataMessage;
        if (msg.event === 'price') void this.onPrice(msg);
      } catch (e) {
        this.logger.warn(`WS parse error: ${(e as Error).message}`);
      }
    });

    ws.on('error', (err) => {
      this.logger.warn(`WS error: ${err.message}`);
    });

    ws.on('close', (code, reason) => {
      if (this.closed) return;
      this.logger.warn(`WS closed (${code} ${reason.toString()}) — reconnecting`);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'heartbeat' }));
      }
    }, HEARTBEAT_MS);
  }

  // ---- Tick handling -----------------------------------------------------
  private async onPrice(msg: TwelveDataPriceEvent) {
    const localSymbol = REVERSE_MAP[msg.symbol];
    if (!localSymbol) return;
    const def = this.symbols.find((s) => s.code === localSymbol);
    if (!def) return;
    const last = msg.price;
    // TwelveData publishes bid/ask on currency pairs but not always on commodities/crypto.
    const halfSpread = (def.spread * def.pipSize) / 2;
    const bid = msg.bid ?? last - halfSpread;
    const ask = msg.ask ?? last + halfSpread;
    await this.publishTick({
      symbol: localSymbol,
      bid,
      ask,
      last,
      timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
    });
  }

  // ---- Fallback for symbols not in Twelve Data --------------------------
  private startFallbackLoop() {
    if (this.fallbackSymbols.length === 0) return;
    this.mockInterval = setInterval(() => {
      for (const sym of this.fallbackSymbols) {
        const prev = this.state.get(sym.code);
        if (!prev) continue;
        const drift = sym.volatility * sym.pipSize * (Math.random() * 2 - 1);
        const minPrice = sym.startPrice * 0.7;
        const maxPrice = sym.startPrice * 1.3;
        const last = Math.min(Math.max(prev.last + drift, minPrice), maxPrice);
        void this.publishTick({ symbol: sym.code, last });
      }
    }, 1_000);
  }
}
