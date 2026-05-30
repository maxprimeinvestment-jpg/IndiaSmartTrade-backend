import { Global, Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { PositionsModule } from '../positions/positions.module';
import { TRADING_CLIENT } from '../../common/trading/trading-client';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';

@Global()
@Module({
  imports: [MarketDataModule, PositionsModule],
  controllers: [TradingController],
  providers: [
    TradingService,
    { provide: TRADING_CLIENT, useExisting: TradingService },
  ],
  exports: [TradingService, TRADING_CLIENT],
})
export class TradingModule {}
