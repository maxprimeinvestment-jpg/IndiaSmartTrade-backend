import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { MarketDataModule } from '../../modules/market-data/market-data.module';
import { REALTIME_TOKEN } from './realtime';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthModule, MarketDataModule],
  providers: [
    RealtimeGateway,
    { provide: REALTIME_TOKEN, useExisting: RealtimeGateway },
  ],
  exports: [RealtimeGateway, REALTIME_TOKEN],
})
export class RealtimeModule {}
