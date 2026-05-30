import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { DepositService } from './deposit.service';
import { CreateDepositDto } from './dto/create-deposit.dto';

@ApiTags('deposits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deposits')
export class DepositController {
  constructor(private readonly deposits: DepositService) {}

  @Get('bank-accounts')
  @ApiOperation({ summary: 'List active bank accounts to deposit to' })
  banks() {
    return this.deposits.listBankAccounts();
  }

  @Post()
  @ApiOperation({ summary: 'Submit a deposit request' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepositDto) {
    return this.deposits.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my deposits' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pg: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.deposits.list(user.id, pg.page, pg.limit, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one deposit' })
  one(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.deposits.getOne(user.id, id);
  }
}
