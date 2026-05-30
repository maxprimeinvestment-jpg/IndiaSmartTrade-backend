import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { MarketService } from './market.service';

@ApiTags('market')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('symbols')
  @ApiOperation({ summary: 'List visible tradable symbols' })
  symbols(@Query('category') category?: string) {
    return this.market.listSymbols(category);
  }

  @Get('quotes')
  @ApiOperation({ summary: 'Latest snapshot of quotes' })
  quotes(@Query('symbols') symbols?: string) {
    return this.market.listQuotes(symbols);
  }

  @Get('quotes/:symbol/ohlc')
  @ApiOperation({ summary: 'OHLC candles' })
  ohlc(
    @Param('symbol') symbol: string,
    @Query('interval') interval = 'M1',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.market.getOhlc(symbol, interval, from, to);
  }
}
