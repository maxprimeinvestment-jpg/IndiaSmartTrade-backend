import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { createRedisClient } from '../../common/redis';
import { REALTIME_TOKEN, type RealtimeEmitter } from '../../common/gateway/realtime';
import { TRADING_CLIENT, type TradingClient } from '../../common/trading/trading-client';
import { MARKET_TICKS_CHANNEL, type LiveQuote } from '../market-data/market-provider.interface';
import { PositionRegistry, type RegistryEntry } from './position-registry';

const PNL_DEBOUNCE_MS = 250;

@Injectable()
export class PositionsEngine implements OnModuleInit {
  private readonly logger = new Logger(PositionsEngine.name);
  private readonly subscriber: Redis;
  private lastEmit = new Map<string, number>();

  constructor(
    config: ConfigService,
    private readonly registry: PositionRegistry,
    @Inject(REALTIME_TOKEN) private readonly realtime: RealtimeEmitter,
    @Inject(TRADING_CLIENT) private readonly trading: TradingClient,
  ) {
    this.subscriber = createRedisClient(config.get<string>('REDIS_URL'));
  }

  onModuleInit() {
    this.subscriber.on('message', (_channel, message) => {
      try {
        const ticks = JSON.parse(message) as LiveQuote[];
        for (const tick of ticks) this.processTick(tick);
      } catch (e) {
        this.logger.error('Failed to parse tick payload', e as Error);
      }
    });
    // Fire-and-forget: don't block app boot on the Redis connection. ioredis
    // queues the SUBSCRIBE until connected and auto-resubscribes on reconnect.
    this.subscriber
      .subscribe(MARKET_TICKS_CHANNEL)
      .then(() => this.logger.log('PositionsEngine subscribed to market.ticks'))
      .catch((e) => this.logger.error('Failed to subscribe to market.ticks', e as Error));
  }

  private processTick(tick: LiveQuote) {
    const positions = this.registry.forSymbol(tick.symbol);
    if (positions.length === 0) return;
    const now = Date.now();
    for (const p of positions) {
      const closeBy = this.checkSlTp(p, tick);
      if (closeBy) {
        // Fire-and-forget close; the registry lock prevents double-close.
        if (this.registry.tryLockForClose(p.id)) {
          this.registry.unlock(p.id); // release immediately; trading service will lock again
          this.trading
            .forceClose(p.id, closeBy, null)
            .catch((err) => this.logger.error(`Auto-close failed: ${(err as Error).message}`));
        }
        continue;
      }
      const last = this.lastEmit.get(p.id) ?? 0;
      if (now - last < PNL_DEBOUNCE_MS) continue;
      this.lastEmit.set(p.id, now);
      const pnl = this.computePnl(p, tick);
      this.realtime.emitToUser(p.userId, 'position:pnl_update', {
        positionId: p.id,
        currentPrice: this.markPrice(p, tick),
        unrealizedPnl: pnl,
        marginLevel: null,
      });
    }
  }

  private markPrice(p: RegistryEntry, tick: LiveQuote): number {
    return p.side === 'BUY' ? tick.bid : tick.ask;
  }

  private computePnl(p: RegistryEntry, tick: LiveQuote): number {
    const exit = this.markPrice(p, tick);
    const sign = p.side === 'BUY' ? 1 : -1;
    return Number((p.lots * p.contractSize * (exit - p.entryPrice) * sign).toFixed(2));
  }

  private checkSlTp(p: RegistryEntry, tick: LiveQuote): 'STOP_LOSS' | 'TAKE_PROFIT' | null {
    const price = this.markPrice(p, tick);
    if (p.side === 'BUY') {
      if (p.stopLoss !== null && price <= p.stopLoss) return 'STOP_LOSS';
      if (p.takeProfit !== null && price >= p.takeProfit) return 'TAKE_PROFIT';
    } else {
      if (p.stopLoss !== null && price >= p.stopLoss) return 'STOP_LOSS';
      if (p.takeProfit !== null && price <= p.takeProfit) return 'TAKE_PROFIT';
    }
    return null;
  }
}
