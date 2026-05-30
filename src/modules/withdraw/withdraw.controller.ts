import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawService } from './withdraw.service';

@ApiTags('withdrawals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('withdrawals')
export class WithdrawController {
  constructor(private readonly withdraw: WithdrawService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a withdrawal request (debits free margin immediately)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWithdrawalDto) {
    return this.withdraw.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my withdrawals' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pg: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.withdraw.list(user.id, pg.page, pg.limit, status);
  }
}
