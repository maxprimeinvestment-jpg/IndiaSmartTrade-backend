import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type RegistryEntry = {
  id: string;
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  lots: number;
  leverage: number;
  entryPrice: number;
  marginUsed: number;
  stopLoss: number | null;
  takeProfit: number | null;
  contractSize: number;
};

/**
 * In-memory mirror of OPEN positions, keyed by symbol then position id.
 * The trade engine reads from here on every market tick to recompute P&L
 * without hitting the DB.
 */
@Injectable()
export class PositionRegistry implements OnModuleInit {
  private readonly logger = new Logger(PositionRegistry.name);
  private readonly bySymbol = new Map<string, Map<string, RegistryEntry>>();
  private readonly closing = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const open = await this.prisma.position.findMany({ where: { status: 'OPEN' } });
    for (const p of open) {
      this.add({
        id: p.id,
        userId: p.userId,
        symbol: p.symbol,
        side: p.side as 'BUY' | 'SELL',
        lots: p.lots.toNumber(),
        leverage: p.leverage,
        entryPrice: p.entryPrice.toNumber(),
        marginUsed: p.marginUsed.toNumber(),
        stopLoss: p.stopLoss?.toNumber() ?? null,
        takeProfit: p.takeProfit?.toNumber() ?? null,
        contractSize: 1, // patched by trading service on add
      });
    }
    this.logger.log(`Loaded ${open.length} open positions into registry`);
  }

  add(entry: RegistryEntry) {
    let inner = this.bySymbol.get(entry.symbol);
    if (!inner) {
      inner = new Map();
      this.bySymbol.set(entry.symbol, inner);
    }
    inner.set(entry.id, entry);
  }

  remove(symbol: string, id: string) {
    this.bySymbol.get(symbol)?.delete(id);
    this.closing.delete(id);
  }

  forSymbol(symbol: string): RegistryEntry[] {
    const inner = this.bySymbol.get(symbol);
    if (!inner) return [];
    return Array.from(inner.values());
  }

  tryLockForClose(positionId: string): boolean {
    if (this.closing.has(positionId)) return false;
    this.closing.add(positionId);
    return true;
  }

  unlock(positionId: string) {
    this.closing.delete(positionId);
  }

  updateSlTp(symbol: string, id: string, stopLoss: number | null, takeProfit: number | null) {
    const entry = this.bySymbol.get(symbol)?.get(id);
    if (entry) {
      entry.stopLoss = stopLoss;
      entry.takeProfit = takeProfit;
    }
  }
}
