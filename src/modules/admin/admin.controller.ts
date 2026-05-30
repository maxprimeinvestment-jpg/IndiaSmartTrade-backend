import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AdminService } from './admin.service';
import {
  AdjustWalletDto,
  BankAccountDto,
  FreezeUserDto,
  RejectReasonDto,
  TicketStatusDto,
  VisibilityDto,
} from './dto/admin.dto';

function ctx(req: Request, user: AuthenticatedUser) {
  return {
    adminId: user.id,
    ip: req.ip ?? undefined,
    userAgent: req.headers['user-agent'] ?? undefined,
  };
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Aggregate dashboard counts' })
  dashboard() {
    return this.admin.dashboard();
  }

  // ---- users ----
  @Get('users')
  users(
    @Query() pg: PaginationDto,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.listUsers(pg.page, pg.limit, search, status);
  }

  @Patch('users/:id/freeze')
  freeze(
    @Param('id') id: string,
    @Body() dto: FreezeUserDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.setUserFrozen(id, dto.frozen, ctx(req, admin));
  }

  @Patch('users/:id/wallet')
  adjustWallet(
    @Param('id') id: string,
    @Body() dto: AdjustWalletDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.adjustWallet(id, dto, ctx(req, admin));
  }

  // ---- deposits ----
  @Get('deposits')
  deposits(@Query() pg: PaginationDto, @Query('status') status?: string) {
    return this.admin.listDeposits(pg.page, pg.limit, status);
  }

  @Post('deposits/:id/approve')
  approveDeposit(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.approveDeposit(id, ctx(req, admin));
  }

  @Post('deposits/:id/reject')
  rejectDeposit(
    @Param('id') id: string,
    @Body() dto: RejectReasonDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.rejectDeposit(id, dto.reason, ctx(req, admin));
  }

  // ---- withdrawals ----
  @Get('withdrawals')
  withdrawals(@Query() pg: PaginationDto, @Query('status') status?: string) {
    return this.admin.listWithdrawals(pg.page, pg.limit, status);
  }

  @Post('withdrawals/:id/approve')
  approveWithdrawal(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.approveWithdrawal(id, ctx(req, admin));
  }

  @Post('withdrawals/:id/complete')
  completeWithdrawal(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.completeWithdrawal(id, ctx(req, admin));
  }

  @Post('withdrawals/:id/reject')
  rejectWithdrawal(
    @Param('id') id: string,
    @Body() dto: RejectReasonDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.rejectWithdrawal(id, dto.reason, ctx(req, admin));
  }

  // ---- positions ----
  @Get('positions')
  positions(
    @Query() pg: PaginationDto,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.admin.listPositions(pg.page, pg.limit, status, userId);
  }

  @Post('positions/:id/force-close')
  forceClose(
    @Param('id') id: string,
    @Body() dto: RejectReasonDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.forceClosePosition(id, dto.reason, ctx(req, admin));
  }

  // ---- bank accounts ----
  @Get('bank-accounts')
  banks() {
    return this.admin.listBankAccounts();
  }

  @Post('bank-accounts')
  createBank(
    @Body() dto: BankAccountDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.createBankAccount(dto, ctx(req, admin));
  }

  @Patch('bank-accounts/:id')
  updateBank(
    @Param('id') id: string,
    @Body() dto: Partial<BankAccountDto>,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.updateBankAccount(id, dto, ctx(req, admin));
  }

  @Delete('bank-accounts/:id')
  deleteBank(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.deleteBankAccount(id, ctx(req, admin));
  }

  // ---- audit logs ----
  @Get('audit-logs')
  audit(
    @Query() pg: PaginationDto,
    @Query('adminId') adminId?: string,
    @Query('action') action?: string,
  ) {
    return this.admin.listAuditLogs(pg.page, pg.limit, adminId, action);
  }

  // ---- tickets ----
  @Get('tickets')
  tickets(@Query() pg: PaginationDto, @Query('status') status?: string) {
    return this.admin.listTickets(pg.page, pg.limit, status);
  }

  @Get('tickets/:id')
  ticket(@Param('id') id: string) {
    return this.admin.getTicket(id);
  }

  @Post('tickets/:id/messages')
  ticketReply(
    @Param('id') id: string,
    @Body() body: { message: string },
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.addTicketMessage(id, body.message, ctx(req, admin));
  }

  @Patch('tickets/:id/status')
  ticketStatus(
    @Param('id') id: string,
    @Body() dto: TicketStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.updateTicketStatus(id, dto, ctx(req, admin));
  }

  // ---- exposure ----
  @Get('exposure')
  exposure() {
    return this.admin.exposure();
  }

  // ---- market visibility ----
  @Get('symbols')
  @ApiOperation({ summary: 'List all symbols with their visibility flags' })
  symbols() {
    return this.admin.listAllSymbols();
  }

  @Patch('market/:symbol/visibility')
  visibility(
    @Param('symbol') symbol: string,
    @Body() dto: VisibilityDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.setSymbolVisibility(symbol, dto, ctx(req, admin));
  }
}
