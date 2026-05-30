import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { MARKET_PROVIDER_TOKEN } from '../market-data/market-provider.token';
import type { MarketProvider } from '../market-data/market-provider.interface';
import { SYMBOL_BY_CODE } from '../market-data/symbols';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MARKET_PROVIDER_TOKEN) private readonly market: MarketProvider,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const balance = wallet.balance;
    const marginUsed = wallet.marginUsed;
    const unrealizedPnl = await this.computeUnrealizedPnl(userId);
    const equity = balance.plus(unrealizedPnl);
    const freeMargin = equity.minus(marginUsed);
    const marginLevel = marginUsed.gt(ZERO)
      ? equity.div(marginUsed).mul(100).toNumber()
      : null;
    return {
      userId: wallet.userId,
      balance: balance.toNumber(),
      marginUsed: marginUsed.toNumber(),
      equity: equity.toNumber(),
      freeMargin: freeMargin.toNumber(),
      unrealizedPnl: unrealizedPnl.toNumber(),
      marginLevel,
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  private async computeUnrealizedPnl(userId: string): Promise<Prisma.Decimal> {
    const open = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
      select: { symbol: true, side: true, lots: true, entryPrice: true },
    });
    if (open.length === 0) return ZERO;
    let total = ZERO;
    for (const p of open) {
      const sym = SYMBOL_BY_CODE.get(p.symbol);
      if (!sym) continue;
      const quote = await this.market.getQuoteFromCache(p.symbol);
      if (!quote) continue;
      const exit = p.side === 'BUY' ? quote.bid : quote.ask;
      const sign = p.side === 'BUY' ? 1 : -1;
      const pnl =
        p.lots.toNumber() * sym.contractSize * (exit - p.entryPrice.toNumber()) * sign;
      if (Number.isFinite(pnl)) total = total.plus(pnl);
    }
    return total;
  }

  async listTransactions(userId: string, page: number, limit: number, type?: string) {
    const where: Prisma.WalletTransactionWhereInput = {
      userId,
      ...(type ? { type: type as Prisma.WalletTransactionWhereInput['type'] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return paginated(
      data.map((t) => ({
        id: t.id,
        userId: t.userId,
        type: t.type,
        amount: t.amount.toNumber(),
        balanceAfter: t.balanceAfter.toNumber(),
        reference: t.reference,
        metadata: t.metadata as Record<string, unknown> | null,
        createdAt: t.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    );
  }
}
