import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance + margin' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.getWallet(user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List wallet ledger entries' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() pg: PaginationDto, @Query('type') type?: string) {
    return this.wallet.listTransactions(user.id, pg.page, pg.limit, type);
  }
}
