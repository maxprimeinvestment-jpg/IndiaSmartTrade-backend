import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listTrades(userId: string, page: number, limit: number, from?: string, to?: string) {
    const where: Prisma.TradeHistoryWhereInput = {
      userId,
      ...(from || to
        ? {
            closedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.tradeHistory.findMany({
        where,
        orderBy: { closedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tradeHistory.count({ where }),
    ]);
    return paginated(
      data.map((t) => ({
        id: t.id,
        positionId: t.positionId,
        userId: t.userId,
        symbol: t.symbol,
        side: t.side,
        lots: t.lots.toNumber(),
        leverage: t.leverage,
        entryPrice: t.entryPrice.toNumber(),
        exitPrice: t.exitPrice.toNumber(),
        realizedPnl: t.realizedPnl.toNumber(),
        closeReason: t.closeReason,
        openedAt: t.openedAt.toISOString(),
        closedAt: t.closedAt.toISOString(),
      })),
      page,
      limit,
      total,
    );
  }
}
