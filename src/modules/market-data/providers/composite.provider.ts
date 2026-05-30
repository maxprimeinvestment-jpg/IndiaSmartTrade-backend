import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { LiveQuote, MarketProvider } from '../market-provider.interface';
import { SYMBOLS, type SymbolDef } from '../symbols';

type ChildProvider = MarketProvider & Partial<OnModuleInit> & Partial<OnModuleDestroy>;

/**
 * Routes per-symbol calls to the child provider that owns that symbol.
 * Each child handles a disjoint subset of SYMBOLS (defined by its own
 * `symbols` getter); the composite is the single object the rest of the
 * app sees behind `MARKET_PROVIDER_TOKEN`.
 */
export class CompositeMarketProvider implements MarketProvider, OnModuleInit, OnModuleDestroy {
  readonly providerName = 'composite';
  private readonly log = new Logger('CompositeMarketProvider');
  private readonly routes = new Map<string, ChildProvider>();

  constructor(private readonly children: ChildProvider[]) {
    for (const child of children) {
      for (const sym of child.symbols) {
        if (this.routes.has(sym.code)) {
          this.log.warn(
            `Symbol ${sym.code} claimed by both ${this.routes.get(sym.code)!.providerName} and ${child.providerName}; keeping first.`,
          );
          continue;
        }
        this.routes.set(sym.code, child);
      }
    }
  }

  get symbols(): readonly SymbolDef[] {
    return SYMBOLS;
  }

  async onModuleInit() {
    for (const c of this.children) {
      if (typeof c.onModuleInit === 'function') await c.onModuleInit();
    }
    const summary = this.children
      .map((c) => `${c.providerName}=${c.symbols.length}`)
      .join(', ');
    this.log.log(`Composite ready: ${summary}`);
  }

  async onModuleDestroy() {
    for (const c of this.children) {
      if (typeof c.onModuleDestroy === 'function') await c.onModuleDestroy();
    }
  }

  getQuote(symbol: string): LiveQuote | undefined {
    return this.routes.get(symbol)?.getQuote(symbol);
  }

  async getQuoteFromCache(symbol: string): Promise<LiveQuote | null> {
    const child = this.routes.get(symbol);
    return child ? child.getQuoteFromCache(symbol) : null;
  }

  async getVisibleSymbols(): Promise<readonly SymbolDef[]> {
    const lists = await Promise.all(this.children.map((c) => c.getVisibleSymbols()));
    return lists.flat();
  }
}
