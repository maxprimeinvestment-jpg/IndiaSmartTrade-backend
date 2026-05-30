import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMarketProvider } from './base';
import { SYMBOLS, type SymbolDef } from '../symbols';

const TICK_INTERVAL_MS = 500;

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

@Injectable()
export class MockMarketProvider extends BaseMarketProvider {
  readonly providerName = 'mock';
  private interval: NodeJS.Timeout | null = null;
  private readonly symbolFilter?: (s: SymbolDef) => boolean;

  constructor(config: ConfigService, symbolFilter?: (s: SymbolDef) => boolean) {
    super(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', 'MockMarketProvider');
    this.symbolFilter = symbolFilter;
  }

  override get symbols(): readonly SymbolDef[] {
    return this.symbolFilter ? SYMBOLS.filter(this.symbolFilter) : SYMBOLS;
  }

  protected async start() {
    this.interval = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
  }

  protected async stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async tick() {
    for (const sym of this.symbols) {
      const prev = this.state.get(sym.code);
      if (!prev) continue;
      const drift = sym.volatility * sym.pipSize * randn();
      const minPrice = sym.startPrice * 0.7;
      const maxPrice = sym.startPrice * 1.3;
      const newLast = clamp(prev.last + drift, minPrice, maxPrice);
      await this.publishTick({ symbol: sym.code, last: newLast });
    }
  }
}
