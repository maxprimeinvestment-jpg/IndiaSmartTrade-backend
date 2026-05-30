import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { MARKET_PROVIDER_TOKEN } from '../market-data/market-provider.token';
import type { MarketProvider } from '../market-data/market-provider.interface';
import { SYMBOL_BY_CODE } from '../market-data/symbols';

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MARKET_PROVIDER_TOKEN) private readonly market: MarketProvider,
  ) {}

  async list(userId: string, status?: string, page = 1, limit = 20) {
    const where: Prisma.PositionWhereInput = {
      userId,
      ...(status ? { status: status as Prisma.PositionWhereInput['status'] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.position.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.position.count({ where }),
    ]);
    const data = await Promise.all(rows.map((p) => this.shape(p)));
    return paginated(data, page, limit, total);
  }

  async getOne(userId: string, id: string) {
    const p = await this.prisma.position.findUnique({ where: { id } });
    if (!p || p.userId !== userId) throw new NotFoundException();
    return this.shape(p);
  }

  private async shape(p: {
    id: string;
    userId: string;
    symbol: string;
    side: string;
    status: string;
    lots: Prisma.Decimal;
    leverage: number;
    entryPrice: Prisma.Decimal;
    exitPrice: Prisma.Decimal | null;
    stopLoss: Prisma.Decimal | null;
    takeProfit: Prisma.Decimal | null;
    marginUsed: Prisma.Decimal;
    realizedPnl: Prisma.Decimal | null;
    closeReason: string | null;
    openedAt: Date;
    closedAt: Date | null;
  }) {
    let unrealizedPnl = 0;
    if (p.status === 'OPEN') {
      const sym = SYMBOL_BY_CODE.get(p.symbol);
      const quote = await this.market.getQuoteFromCache(p.symbol);
      if (sym && quote) {
        const exit = p.side === 'BUY' ? quote.bid : quote.ask;
        const sign = p.side === 'BUY' ? 1 : -1;
        unrealizedPnl = Number(
          (p.lots.toNumber() * sym.contractSize * (exit - p.entryPrice.toNumber()) * sign).toFixed(2),
        );
      }
    }
    return {
      id: p.id,
      userId: p.userId,
      symbol: p.symbol,
      side: p.side,
      status: p.status,
      lots: p.lots.toNumber(),
      leverage: p.leverage,
      entryPrice: p.entryPrice.toNumber(),
      exitPrice: p.exitPrice?.toNumber() ?? null,
      stopLoss: p.stopLoss?.toNumber() ?? null,
      takeProfit: p.takeProfit?.toNumber() ?? null,
      marginUsed: p.marginUsed.toNumber(),
      realizedPnl: p.realizedPnl?.toNumber() ?? null,
      unrealizedPnl,
      closeReason: p.closeReason,
      openedAt: p.openedAt.toISOString(),
      closedAt: p.closedAt?.toISOString() ?? null,
    };
  }
}
