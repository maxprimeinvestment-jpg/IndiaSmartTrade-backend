import type { SymbolDef } from './symbols';

export type LiveQuote = {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  changePct24h: number;
  timestamp: number;
};

export const MARKET_TICKS_CHANNEL = 'market.ticks';

/**
 * A market data provider delivers a stream of quote updates for a fixed set of
 * symbols. Implementations push ticks into Redis (`quote:<symbol>`) and publish
 * the same ticks on the `market.ticks` pub/sub channel — the gateway and the
 * positions engine subscribe there.
 */
export interface MarketProvider {
  /** Symbols this provider can deliver. */
  readonly symbols: readonly SymbolDef[];
  /** Latest quote for one symbol, from in-memory state. */
  getQuote(symbol: string): LiveQuote | undefined;
  /** Latest quote for one symbol, falling back to Redis cache. */
  getQuoteFromCache(symbol: string): Promise<LiveQuote | null>;
  /** Subset of symbols currently visible (admin can hide some). */
  getVisibleSymbols(): Promise<readonly SymbolDef[]>;
  /** Provider identifier for logs / dashboards. */
  readonly providerName: string;
}
