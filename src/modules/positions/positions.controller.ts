import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PositionsService } from './positions.service';

@ApiTags('positions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @ApiOperation({ summary: 'List positions (filter by status)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pg: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.positions.list(user.id, status, pg.page, pg.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one position' })
  one(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.positions.getOne(user.id, id);
  }
}
