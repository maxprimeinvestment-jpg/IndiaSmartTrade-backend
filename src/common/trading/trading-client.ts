import { Global, Injectable, Module, NotImplementedException } from '@nestjs/common';

export const TRADING_CLIENT = 'TRADING_CLIENT';

export type TradingCloseReason =
  | 'USER'
  | 'STOP_LOSS'
  | 'TAKE_PROFIT'
  | 'ADMIN_FORCE'
  | 'LIQUIDATION';

export interface TradingClient {
  forceClose(
    positionId: string,
    reason: TradingCloseReason,
    adminId: string | null,
  ): Promise<unknown>;
}

@Injectable()
export class StubTradingClient implements TradingClient {
  async forceClose(): Promise<never> {
    throw new NotImplementedException('Trading module is not loaded yet');
  }
}

@Global()
@Module({
  providers: [{ provide: TRADING_CLIENT, useClass: StubTradingClient }],
  exports: [TRADING_CLIENT],
})
export class TradingClientStubModule {}
