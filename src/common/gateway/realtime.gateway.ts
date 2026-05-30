import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { createRedisClient } from '../redis';
import {
  MARKET_TICKS_CHANNEL,
  type LiveQuote,
  type MarketProvider,
} from '../../modules/market-data/market-provider.interface';
import { MARKET_PROVIDER_TOKEN } from '../../modules/market-data/market-provider.token';
import { SYMBOLS } from '../../modules/market-data/symbols';
import type { RealtimeEmitter } from './realtime';

const TICK_THROTTLE_MS = 200;

@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, RealtimeEmitter {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;
  private readonly subscriber: Redis;
  private readonly socketSubs = new Map<string, Set<string>>();
  private readonly lastTickEmit = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(MARKET_PROVIDER_TOKEN) private readonly market: MarketProvider,
  ) {
    this.subscriber = createRedisClient(this.config.get<string>('REDIS_URL'));
  }

  onModuleInit() {
    this.subscriber.on('message', (_channel, message) => {
      try {
        const ticks = JSON.parse(message) as LiveQuote[];
        const now = Date.now();
        for (const tick of ticks) {
          const last = this.lastTickEmit.get(tick.symbol) ?? 0;
          if (now - last < TICK_THROTTLE_MS) continue;
          this.lastTickEmit.set(tick.symbol, now);
          this.broadcastTick(tick);
        }
      } catch (e) {
        this.logger.error('Failed to handle market tick', e as Error);
      }
    });
    // Fire-and-forget: don't block app boot on the Redis connection. ioredis
    // queues the SUBSCRIBE until connected and auto-resubscribes on reconnect.
    this.subscriber
      .subscribe(MARKET_TICKS_CHANNEL)
      .catch((e) => this.logger.error('Failed to subscribe to market.ticks', e as Error));
    setInterval(() => void this.broadcastExposure(), 5000);
  }

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string | undefined) ?? '';
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        role: string;
        sessionId: string;
      }>(token, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.data.sessionId = payload.sessionId;
      client.join(`user:${payload.sub}`);
      client.join('market');
      if (payload.role === 'ADMIN' || payload.role === 'SUPER_ADMIN') {
        client.join('admin');
      }
      // Send snapshot of all current quotes
      const visible = await this.market.getVisibleSymbols();
      const ticks = visible
        .map((s) => this.market.getQuote(s.code))
        .filter((q): q is LiveQuote => Boolean(q));
      client.emit('quote:batch', { ticks });
    } catch (e) {
      this.logger.warn(`WS auth failed: ${(e as Error).message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe:symbols')
  onSubscribeSymbols(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { symbols: string[] },
  ) {
    const set = this.socketSubs.get(client.id) ?? new Set<string>();
    for (const s of body.symbols ?? []) set.add(s);
    this.socketSubs.set(client.id, set);
  }

  @SubscribeMessage('unsubscribe:symbols')
  onUnsubscribeSymbols(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { symbols: string[] },
  ) {
    const set = this.socketSubs.get(client.id);
    if (!set) return;
    for (const s of body.symbols ?? []) set.delete(s);
  }

  // ---- RealtimeEmitter ----
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToAdmins(event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to('admin').emit(event, payload);
  }

  emitToMarket(event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to('market').emit(event, payload);
  }

  private broadcastTick(tick: LiveQuote) {
    if (!this.server) return;
    this.server.to('market').emit('quote:tick', tick);
  }

  private async broadcastExposure() {
    if (!this.server) return;
    if ((this.server.sockets.adapter.rooms.get('admin')?.size ?? 0) === 0) return;
    // Fire a lightweight exposure ping per symbol — admin clients aggregate.
    for (const sym of SYMBOLS) {
      const q = await this.market.getQuoteFromCache(sym.code);
      if (!q) continue;
      this.emitToAdmins('admin:tick', q);
    }
  }
}
