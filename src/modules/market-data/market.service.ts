import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MARKET_PROVIDER_TOKEN } from './market-provider.token';
import type { MarketProvider } from './market-provider.interface';
import { SYMBOL_BY_CODE } from './symbols';

@Injectable()
export class MarketService {
  constructor(
    @Inject(MARKET_PROVIDER_TOKEN) private readonly provider: MarketProvider,
    private readonly prisma: PrismaService,
  ) {}

  async listSymbols(category?: string) {
    const visible = await this.provider.getVisibleSymbols();
    return visible
      .filter((s) => !category || s.category === category)
      .map((s) => ({
        code: s.code,
        displayName: s.displayName,
        category: s.category,
        pipSize: s.pipSize,
        digits: s.digits,
        contractSize: s.contractSize,
        region: s.region,
        currency: s.currency,
        lotSize: s.lotSize,
        hours: s.hours ?? null,
        visible: true,
      }));
  }

  async listQuotes(symbols?: string) {
    const list = symbols ? symbols.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const codes = list ?? Array.from(SYMBOL_BY_CODE.keys());
    const quotes = await Promise.all(
      codes.map(async (code) => this.provider.getQuoteFromCache(code)),
    );
    return quotes.filter((q): q is NonNullable<typeof q> => q !== null);
  }

  async getOhlc(symbol: string, interval = 'M1', from?: string, to?: string) {
    if (!SYMBOL_BY_CODE.has(symbol)) throw new NotFoundException('Unknown symbol');
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const rows = await this.prisma.liveQuote.findMany({
      where: {
        symbol,
        interval: interval as 'M1',
        startedAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { startedAt: 'asc' },
      take: 1000,
    });
    return rows.map((r) => ({
      symbol: r.symbol,
      interval: r.interval,
      startedAt: r.startedAt.toISOString(),
      open: r.open.toNumber(),
      high: r.high.toNumber(),
      low: r.low.toNumber(),
      close: r.close.toNumber(),
      volume: r.volume.toNumber(),
    }));
  }
}
