import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { PositionRegistry } from './position-registry';
import { PositionsController } from './positions.controller';
import { PositionsEngine } from './positions.engine';
import { PositionsService } from './positions.service';

@Module({
  imports: [MarketDataModule],
  controllers: [PositionsController],
  providers: [PositionRegistry, PositionsService, PositionsEngine],
  exports: [PositionRegistry, PositionsService],
})
export class PositionsModule {}
