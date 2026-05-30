import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REALTIME_TOKEN, type RealtimeEmitter } from '../../common/gateway/realtime';
import type { TradingClient, TradingCloseReason } from '../../common/trading/trading-client';
import { MARKET_PROVIDER_TOKEN } from '../market-data/market-provider.token';
import type { MarketProvider } from '../market-data/market-provider.interface';
import { SYMBOL_BY_CODE } from '../market-data/symbols';
import { formatNextOpenIST, isMarketOpen, nextOpen } from '@shared/market';
import { PositionRegistry } from '../positions/position-registry';
import type { OpenPositionDto } from './dto/open-position.dto';
import type { UpdateSlTpDto } from './dto/update-sltp.dto';

const ALLOWED_LEVERAGE = new Set([1, 5, 10, 20, 50, 100, 200, 400]);

@Injectable()
export class TradingService implements TradingClient {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MARKET_PROVIDER_TOKEN) private readonly market: MarketProvider,
    private readonly registry: PositionRegistry,
    @Inject(REALTIME_TOKEN) private readonly realtime: RealtimeEmitter,
  ) {}

  async openPosition(userId: string, dto: OpenPositionDto) {
    const sym = SYMBOL_BY_CODE.get(dto.symbol);
    if (!sym) throw new BadRequestException('Unknown symbol');
    if (!ALLOWED_LEVERAGE.has(dto.leverage)) throw new BadRequestException('Invalid leverage');
    if (dto.lots <= 0) throw new BadRequestException('Lots must be positive');

    if (!isMarketOpen(sym.hours)) {
      const whenStr = formatNextOpenIST(nextOpen(sym.hours));
      throw new BadRequestException(
        whenStr
          ? `${sym.code} market is closed. Next open: ${whenStr}`
          : `${sym.code} market is closed`,
      );
    }
    if (sym.region === 'IN' && sym.lotSize > 0) {
      const r = dto.lots / sym.lotSize;
      if (Math.abs(r - Math.round(r)) > 1e-9) {
        const unit = sym.category === 'INDIAN_EQUITY' ? 'share' : 'lot';
        throw new BadRequestException(
          `${sym.code} must be traded in multiples of ${sym.lotSize} ${unit}.`,
        );
      }
    }

    const quote = await this.market.getQuoteFromCache(sym.code);
    if (!quote) throw new BadRequestException('No price available for symbol');
    const entryPrice = dto.side === 'BUY' ? quote.ask : quote.bid;
    const lots = new Prisma.Decimal(dto.lots);
    const leverage = dto.leverage;
    const margin = lots
      .mul(sym.contractSize)
      .mul(entryPrice)
      .div(leverage);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new BadRequestException('Wallet missing');
        const free = wallet.balance.minus(wallet.marginUsed);
        if (free.lt(margin)) throw new BadRequestException('Insufficient free margin');
        const newMarginUsed = wallet.marginUsed.plus(margin);
        await tx.wallet.update({
          where: { userId },
          data: { marginUsed: newMarginUsed },
        });
        await tx.walletTransaction.create({
          data: {
            userId,
            type: 'TRADE_MARGIN_LOCK',
            amount: margin.neg(),
            balanceAfter: wallet.balance,
            reference: 'trade-open',
          },
        });
        const position = await tx.position.create({
          data: {
            userId,
            symbol: sym.code,
            side: dto.side,
            status: 'OPEN',
            lots,
            leverage,
            entryPrice: new Prisma.Decimal(entryPrice),
            stopLoss: dto.stopLoss ? new Prisma.Decimal(dto.stopLoss) : null,
            takeProfit: dto.takeProfit ? new Prisma.Decimal(dto.takeProfit) : null,
            marginUsed: margin,
          },
        });
        return { position, wallet: { ...wallet, marginUsed: newMarginUsed } };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.registry.add({
      id: result.position.id,
      userId,
      symbol: result.position.symbol,
      side: result.position.side as 'BUY' | 'SELL',
      lots: result.position.lots.toNumber(),
      leverage: result.position.leverage,
      entryPrice: result.position.entryPrice.toNumber(),
      marginUsed: result.position.marginUsed.toNumber(),
      stopLoss: result.position.stopLoss?.toNumber() ?? null,
      takeProfit: result.position.takeProfit?.toNumber() ?? null,
      contractSize: sym.contractSize,
    });

    const shaped = this.shapePosition(result.position);
    this.realtime.emitToUser(userId, 'position:opened', shaped);
    this.realtime.emitToUser(userId, 'wallet:updated', this.walletSnapshot(result.wallet));
    return shaped;
  }

  async closePosition(userId: string, positionId: string) {
    return this.closeInternal(positionId, 'USER', null, userId);
  }

  async forceClose(
    positionId: string,
    reason: TradingCloseReason,
    adminId: string | null,
  ) {
    return this.closeInternal(positionId, reason, adminId, null);
  }

  async updateSlTp(userId: string, positionId: string, dto: UpdateSlTpDto) {
    const position = await this.prisma.position.findUnique({ where: { id: positionId } });
    if (!position || position.userId !== userId) throw new NotFoundException();
    if (position.status !== 'OPEN') throw new BadRequestException('Position is not open');
    const updated = await this.prisma.position.update({
      where: { id: positionId },
      data: {
        stopLoss:
          dto.stopLoss === null
            ? null
            : dto.stopLoss !== undefined
              ? new Prisma.Decimal(dto.stopLoss)
              : undefined,
        takeProfit:
          dto.takeProfit === null
            ? null
            : dto.takeProfit !== undefined
              ? new Prisma.Decimal(dto.takeProfit)
              : undefined,
      },
    });
    this.registry.updateSlTp(
      updated.symbol,
      updated.id,
      updated.stopLoss?.toNumber() ?? null,
      updated.takeProfit?.toNumber() ?? null,
    );
    return this.shapePosition(updated);
  }

  private async closeInternal(
    positionId: string,
    reason: TradingCloseReason,
    adminId: string | null,
    requestingUserId: string | null,
  ) {
    if (!this.registry.tryLockForClose(positionId)) {
      throw new BadRequestException('Position is already closing');
    }
    try {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const position = await tx.position.findUnique({ where: { id: positionId } });
        if (!position) throw new NotFoundException('Position not found');
        if (requestingUserId && position.userId !== requestingUserId) {
          throw new NotFoundException('Position not found');
        }
        if (position.status !== 'OPEN') throw new BadRequestException('Position not open');

        const sym = SYMBOL_BY_CODE.get(position.symbol);
        if (!sym) throw new BadRequestException('Unknown symbol');
        const quote = await this.market.getQuoteFromCache(position.symbol);
        if (!quote) throw new BadRequestException('No price available');

        const exitPrice = position.side === 'BUY' ? quote.bid : quote.ask;
        const sideSign = position.side === 'BUY' ? 1 : -1;
        const realizedPnl = position.lots
          .mul(sym.contractSize)
          .mul(exitPrice - position.entryPrice.toNumber())
          .mul(sideSign);

        const wallet = await tx.wallet.findUnique({ where: { userId: position.userId } });
        if (!wallet) throw new BadRequestException('Wallet missing');
        const newMargin = wallet.marginUsed.minus(position.marginUsed);
        const newBalance = wallet.balance.plus(realizedPnl);
        await tx.wallet.update({
          where: { userId: position.userId },
          data: { marginUsed: newMargin, balance: newBalance },
        });
        await tx.walletTransaction.create({
          data: {
            userId: position.userId,
            type: 'TRADE_MARGIN_RELEASE',
            amount: position.marginUsed,
            balanceAfter: newBalance,
            reference: `position:${position.id}:release`,
          },
        });
        await tx.walletTransaction.create({
          data: {
            userId: position.userId,
            type: 'TRADE_PNL',
            amount: realizedPnl,
            balanceAfter: newBalance,
            reference: `position:${position.id}:pnl`,
          },
        });
        const updated = await tx.position.update({
          where: { id: position.id },
          data: {
            status: 'CLOSED',
            exitPrice: new Prisma.Decimal(exitPrice),
            realizedPnl,
            closeReason: reason,
            forcedById: adminId,
            closedAt: new Date(),
          },
        });
        await tx.tradeHistory.create({
          data: {
            positionId: updated.id,
            userId: updated.userId,
            symbol: updated.symbol,
            side: updated.side,
            lots: updated.lots,
            leverage: updated.leverage,
            entryPrice: updated.entryPrice,
            exitPrice: new Prisma.Decimal(exitPrice),
            realizedPnl,
            closeReason: reason,
            openedAt: updated.openedAt,
            closedAt: updated.closedAt!,
          },
        });
        return {
          position: updated,
          wallet: { ...wallet, balance: newBalance, marginUsed: newMargin },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.registry.remove(result.position.symbol, result.position.id);
    const shaped = this.shapePosition(result.position);
    this.realtime.emitToUser(result.position.userId, 'position:closed', shaped);
    this.realtime.emitToUser(
      result.position.userId,
      'wallet:updated',
      this.walletSnapshot(result.wallet),
    );
    return shaped;
    } finally {
      this.registry.unlock(positionId);
    }
  }

  private shapePosition(p: {
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
      unrealizedPnl: 0,
      closeReason: p.closeReason,
      openedAt: p.openedAt.toISOString(),
      closedAt: p.closedAt?.toISOString() ?? null,
    };
  }

  private walletSnapshot(wallet: { balance: Prisma.Decimal; marginUsed: Prisma.Decimal }) {
    const free = wallet.balance.minus(wallet.marginUsed);
    return {
      balance: wallet.balance.toNumber(),
      equity: wallet.balance.toNumber(),
      freeMargin: free.toNumber(),
      marginLevel: wallet.marginUsed.gt(0)
        ? wallet.balance.div(wallet.marginUsed).mul(100).toNumber()
        : null,
    };
  }
}
