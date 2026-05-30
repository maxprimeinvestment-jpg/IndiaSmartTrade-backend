import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { MARKET_TICKS_CHANNEL, type LiveQuote, type MarketProvider } from '../market-provider.interface';
import { SYMBOLS, type SymbolDef } from '../symbols';

/**
 * Shared plumbing for any provider:
 *  - holds latest quote per symbol in memory
 *  - persists each tick to Redis (`quote:<symbol>`)
 *  - publishes ticks to the pub/sub channel `market.ticks`
 *  - reads `market:visibility:<symbol>` flags written by the admin
 *
 * Concrete providers fill the in-memory map by calling `publishTick()` whenever
 * a new price arrives — from a setInterval (mock) or a WebSocket (real).
 */
export abstract class BaseMarketProvider implements MarketProvider, OnModuleInit, OnModuleDestroy {
  protected readonly logger: Logger;
  protected readonly redis: Redis;
  protected readonly publisher: Redis;
  protected readonly state = new Map<string, LiveQuote>();

  abstract readonly providerName: string;

  constructor(redisUrl: string, loggerName?: string) {
    this.logger = new Logger(loggerName ?? this.constructor.name);
    this.redis = new Redis(redisUrl);
    this.publisher = new Redis(redisUrl);
  }

  /** Symbols this provider handles. Subclasses override to constrain. */
  get symbols(): readonly SymbolDef[] {
    return SYMBOLS;
  }

  async onModuleInit() {
    for (const sym of this.symbols) {
      this.state.set(sym.code, this.initial(sym));
    }
    for (const [, q] of this.state) {
      await this.redis.set(`quote:${q.symbol}`, JSON.stringify(q), 'EX', 86_400);
    }
    await this.start();
    this.logger.log(`${this.providerName} provider running with ${this.symbols.length} symbols`);
  }

  async onModuleDestroy() {
    await this.stop();
    await this.publisher.quit();
    await this.redis.quit();
  }

  protected abstract start(): Promise<void>;
  protected abstract stop(): Promise<void>;

  /** Concrete providers call this with each new tick. */
  protected async publishTick(input: Partial<LiveQuote> & { symbol: string }) {
    const def = this.symbols.find((s) => s.code === input.symbol);
    if (!def) return;
    const prev = this.state.get(input.symbol);
    const last = round(input.last ?? prev?.last ?? def.startPrice, def.digits);
    const halfSpread = (def.spread * def.pipSize) / 2;
    const bid = round(input.bid ?? last - halfSpread, def.digits);
    const ask = round(input.ask ?? last + halfSpread, def.digits);
    const changePct24h =
      input.changePct24h ?? Number((((last - def.startPrice) / def.startPrice) * 100).toFixed(3));
    const tick: LiveQuote = {
      symbol: input.symbol,
      bid,
      ask,
      last,
      changePct24h,
      timestamp: input.timestamp ?? Date.now(),
    };
    this.state.set(tick.symbol, tick);
    await this.redis.set(`quote:${tick.symbol}`, JSON.stringify(tick), 'EX', 86_400);
    await this.publisher.publish(MARKET_TICKS_CHANNEL, JSON.stringify([tick]));
  }

  getQuote(symbol: string): LiveQuote | undefined {
    return this.state.get(symbol);
  }

  async getQuoteFromCache(symbol: string): Promise<LiveQuote | null> {
    const cached = await this.redis.get(`quote:${symbol}`);
    if (cached) return JSON.parse(cached) as LiveQuote;
    return this.state.get(symbol) ?? null;
  }

  async getVisibleSymbols(): Promise<readonly SymbolDef[]> {
    const flags = await Promise.all(
      this.symbols.map(async (s) => {
        const v = await this.redis.get(`market:visibility:${s.code}`);
        return v === null || v === '1';
      }),
    );
    return this.symbols.filter((_, i) => flags[i]);
  }

  protected initial(sym: SymbolDef): LiveQuote {
    const halfSpread = (sym.spread * sym.pipSize) / 2;
    return {
      symbol: sym.code,
      bid: round(sym.startPrice - halfSpread, sym.digits),
      ask: round(sym.startPrice + halfSpread, sym.digits),
      last: round(sym.startPrice, sym.digits),
      changePct24h: 0,
      timestamp: Date.now(),
    };
  }
}

function round(v: number, digits: number) {
  return Number(v.toFixed(digits));
}
