import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { HistoryService } from './history.service';

@ApiTags('history')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('trades')
  @ApiOperation({ summary: 'Paginated trade history' })
  trades(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pg: PaginationDto,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.history.listTrades(user.id, pg.page, pg.limit, from, to);
  }
}
