import { Global, Injectable, Module } from '@nestjs/common';

export const REALTIME_TOKEN = 'REALTIME_EMITTER';

export interface RealtimeEmitter {
  emitToUser(userId: string, event: string, payload: unknown): void;
  emitToAdmins(event: string, payload: unknown): void;
  emitToMarket(event: string, payload: unknown): void;
}

@Injectable()
export class NoopRealtimeEmitter implements RealtimeEmitter {
  emitToUser(): void {
    // Replaced by RealtimeGateway when the trading module is loaded.
  }
  emitToAdmins(): void {}
  emitToMarket(): void {}
}

@Global()
@Module({
  providers: [{ provide: REALTIME_TOKEN, useClass: NoopRealtimeEmitter }],
  exports: [REALTIME_TOKEN],
})
export class RealtimeStubModule {}
