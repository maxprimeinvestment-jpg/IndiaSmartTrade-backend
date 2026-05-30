import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { REALTIME_TOKEN, type RealtimeEmitter } from '../../common/gateway/realtime';
import { TRADING_CLIENT, type TradingClient } from '../../common/trading/trading-client';
import { NotificationService } from '../notification/notification.service';
import { SYMBOLS } from '../market-data/symbols';
import type {
  AdjustWalletDto,
  BankAccountDto,
  TicketStatusDto,
  VisibilityDto,
} from './dto/admin.dto';

type AuditCtx = { adminId: string; ip?: string; userAgent?: string };

@Injectable()
export class AdminService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
    @Inject(REALTIME_TOKEN) private readonly realtime: RealtimeEmitter,
    @Inject(TRADING_CLIENT) private readonly trading: TradingClient,
  ) {
    this.redis = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  // ---------- Dashboard ----------
  async dashboard() {
    const [pendingDeposits, pendingWithdrawals, totalUsers, openPositions] =
      await this.prisma.$transaction([
        this.prisma.deposit.count({ where: { status: 'PENDING' } }),
        this.prisma.withdrawal.count({ where: { status: 'PENDING' } }),
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.position.count({ where: { status: 'OPEN' } }),
      ]);
    return { pendingDeposits, pendingWithdrawals, totalUsers, openPositions };
  }

  // ---------- Users ----------
  async listUsers(page: number, limit: number, search?: string, status?: string) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(status ? { status: status as Prisma.UserWhereInput['status'] } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { wallet: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        balance: u.wallet?.balance.toNumber() ?? 0,
        marginUsed: u.wallet?.marginUsed.toNumber() ?? 0,
        createdAt: u.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    );
  }

  async setUserFrozen(targetId: string, frozen: boolean, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetId },
        data: { status: frozen ? 'FROZEN' : 'ACTIVE' },
      });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: frozen ? 'USER_FREEZE' : 'USER_UNFREEZE',
        targetType: 'user',
        targetId,
        metadata: { frozen },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return user;
    });
  }

  async adjustWallet(targetId: string, dto: AdjustWalletDto, ctx: AuditCtx) {
    const amount = new Prisma.Decimal(dto.amount);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId: targetId } });
        if (!wallet) throw new NotFoundException('Wallet not found');
        const delta = dto.type === 'ADMIN_CREDIT' ? amount : amount.neg();
        const newBalance = wallet.balance.plus(delta);
        if (newBalance.lt(0)) throw new BadRequestException('Resulting balance would be negative');
        await tx.wallet.update({ where: { userId: targetId }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            userId: targetId,
            type: dto.type,
            amount: delta,
            balanceAfter: newBalance,
            reference: 'admin-adjust',
            metadata: { reason: dto.reason },
          },
        });
        await this.audit(tx, {
          adminId: ctx.adminId,
          action: 'WALLET_ADJUST',
          targetType: 'user',
          targetId,
          metadata: { type: dto.type, amount: dto.amount, reason: dto.reason },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        await this.notifications.create({
          userId: targetId,
          type: 'ADMIN_MESSAGE',
          title: dto.type === 'ADMIN_CREDIT' ? 'Wallet credited' : 'Wallet debited',
          message: `Admin ${dto.type === 'ADMIN_CREDIT' ? 'credited' : 'debited'} ${dto.amount}: ${dto.reason}`,
          tx,
        });
        return { wallet: { ...wallet, balance: newBalance } };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.emitWallet(targetId, result.wallet);
    return { balance: result.wallet.balance.toNumber() };
  }

  // ---------- Deposits ----------
  async listDeposits(page: number, limit: number, status?: string) {
    const where: Prisma.DepositWhereInput = status
      ? { status: status as Prisma.DepositWhereInput['status'] }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, fullName: true } } },
      }),
      this.prisma.deposit.count({ where }),
    ]);
    return paginated(
      data.map((d) => ({
        id: d.id,
        userId: d.userId,
        bankAccountId: d.bankAccountId,
        amount: d.amount.toNumber(),
        utr: d.utr,
        screenshotUrl: d.screenshotUrl,
        status: d.status,
        rejectionReason: d.rejectionReason,
        createdAt: d.createdAt.toISOString(),
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
        user: d.user,
      })),
      page,
      limit,
      total,
    );
  }

  async approveDeposit(id: string, ctx: AuditCtx) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const deposit = await tx.deposit.findUnique({ where: { id } });
        if (!deposit) throw new NotFoundException('Deposit not found');
        if (deposit.status !== 'PENDING') {
          throw new BadRequestException('Deposit already processed');
        }
        const wallet = await tx.wallet.findUnique({ where: { userId: deposit.userId } });
        if (!wallet) throw new BadRequestException('User wallet missing');
        const newBalance = wallet.balance.plus(deposit.amount);
        await tx.wallet.update({ where: { userId: deposit.userId }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            userId: deposit.userId,
            type: 'DEPOSIT',
            amount: deposit.amount,
            balanceAfter: newBalance,
            reference: `deposit:${deposit.id}`,
          },
        });
        const updated = await tx.deposit.update({
          where: { id },
          data: {
            status: 'APPROVED',
            verifiedById: ctx.adminId,
            verifiedAt: new Date(),
          },
        });
        await this.audit(tx, {
          adminId: ctx.adminId,
          action: 'DEPOSIT_APPROVE',
          targetType: 'deposit',
          targetId: id,
          metadata: { amount: deposit.amount.toNumber() },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        await this.notifications.create({
          userId: deposit.userId,
          type: 'DEPOSIT_APPROVED',
          title: 'Deposit approved',
          message: `Your deposit of ${deposit.amount.toNumber()} has been credited.`,
          metadata: { depositId: deposit.id },
          tx,
        });
        return { wallet: { ...wallet, balance: newBalance }, deposit: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.emitWallet(result.deposit.userId, result.wallet);
    this.realtime.emitToUser(result.deposit.userId, 'deposit:status_changed', result.deposit);
    return result.deposit;
  }

  async rejectDeposit(id: string, reason: string, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({ where: { id } });
      if (!deposit) throw new NotFoundException('Deposit not found');
      if (deposit.status !== 'PENDING') throw new BadRequestException('Already processed');
      const updated = await tx.deposit.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          verifiedById: ctx.adminId,
          verifiedAt: new Date(),
        },
      });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'DEPOSIT_REJECT',
        targetType: 'deposit',
        targetId: id,
        metadata: { reason },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      await this.notifications.create({
        userId: deposit.userId,
        type: 'DEPOSIT_REJECTED',
        title: 'Deposit rejected',
        message: reason,
        metadata: { depositId: deposit.id },
        tx,
      });
      this.realtime.emitToUser(deposit.userId, 'deposit:status_changed', updated);
      return updated;
    });
  }

  // ---------- Withdrawals ----------
  async listWithdrawals(page: number, limit: number, status?: string) {
    const where: Prisma.WithdrawalWhereInput = status
      ? { status: status as Prisma.WithdrawalWhereInput['status'] }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, fullName: true } } },
      }),
      this.prisma.withdrawal.count({ where }),
    ]);
    return paginated(
      data.map((w) => ({
        id: w.id,
        userId: w.userId,
        amount: w.amount.toNumber(),
        bankName: w.bankName,
        accountName: w.accountName,
        accountNumber: w.accountNumber,
        ifsc: w.ifsc,
        status: w.status,
        rejectionReason: w.rejectionReason,
        createdAt: w.createdAt.toISOString(),
        approvedAt: w.approvedAt?.toISOString() ?? null,
        user: w.user,
      })),
      page,
      limit,
      total,
    );
  }

  async approveWithdrawal(id: string, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUnique({ where: { id } });
      if (!w) throw new NotFoundException();
      if (w.status !== 'PENDING') throw new BadRequestException('Already processed');
      const updated = await tx.withdrawal.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: ctx.adminId, approvedAt: new Date() },
      });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'WITHDRAW_APPROVE',
        targetType: 'withdrawal',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      await this.notifications.create({
        userId: w.userId,
        type: 'WITHDRAW_APPROVED',
        title: 'Withdrawal approved',
        message: `Your withdrawal of ${w.amount.toNumber()} is approved and will be paid out shortly.`,
        metadata: { withdrawalId: w.id },
        tx,
      });
      this.realtime.emitToUser(w.userId, 'withdraw:status_changed', updated);
      return updated;
    });
  }

  async completeWithdrawal(id: string, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.findUnique({ where: { id } });
      if (!w) throw new NotFoundException();
      if (w.status !== 'APPROVED') throw new BadRequestException('Withdrawal must be APPROVED first');
      const updated = await tx.withdrawal.update({
        where: { id },
        data: { status: 'COMPLETED' },
      });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'WITHDRAW_COMPLETE',
        targetType: 'withdrawal',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      this.realtime.emitToUser(w.userId, 'withdraw:status_changed', updated);
      return updated;
    });
  }

  async rejectWithdrawal(id: string, reason: string, ctx: AuditCtx) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const w = await tx.withdrawal.findUnique({ where: { id } });
        if (!w) throw new NotFoundException();
        if (w.status !== 'PENDING' && w.status !== 'APPROVED') {
          throw new BadRequestException('Already finalized');
        }
        const wallet = await tx.wallet.findUnique({ where: { userId: w.userId } });
        if (!wallet) throw new BadRequestException('Wallet missing');
        const newBalance = wallet.balance.plus(w.amount);
        await tx.wallet.update({ where: { userId: w.userId }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            userId: w.userId,
            type: 'WITHDRAW_REFUND',
            amount: w.amount,
            balanceAfter: newBalance,
            reference: `withdrawal:${w.id}:refund`,
          },
        });
        const updated = await tx.withdrawal.update({
          where: { id },
          data: {
            status: 'REJECTED',
            rejectionReason: reason,
            approvedById: ctx.adminId,
            approvedAt: new Date(),
          },
        });
        await this.audit(tx, {
          adminId: ctx.adminId,
          action: 'WITHDRAW_REJECT',
          targetType: 'withdrawal',
          targetId: id,
          metadata: { reason },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        await this.notifications.create({
          userId: w.userId,
          type: 'WITHDRAW_REJECTED',
          title: 'Withdrawal rejected',
          message: reason,
          metadata: { withdrawalId: w.id },
          tx,
        });
        return { wallet: { ...wallet, balance: newBalance }, withdrawal: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.emitWallet(result.withdrawal.userId, result.wallet);
    this.realtime.emitToUser(result.withdrawal.userId, 'withdraw:status_changed', result.withdrawal);
    return result.withdrawal;
  }

  // ---------- Positions ----------
  async listPositions(page: number, limit: number, status?: string, userId?: string) {
    const where: Prisma.PositionWhereInput = {
      ...(status ? { status: status as Prisma.PositionWhereInput['status'] } : {}),
      ...(userId ? { userId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.position.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, fullName: true } } },
      }),
      this.prisma.position.count({ where }),
    ]);
    return paginated(
      data.map((p) => ({
        id: p.id,
        userId: p.userId,
        symbol: p.symbol,
        side: p.side,
        status: p.status,
        lots: p.lots.toNumber(),
        leverage: p.leverage,
        entryPrice: p.entryPrice.toNumber(),
        exitPrice: p.exitPrice?.toNumber() ?? null,
        stopLoss: p.stopLoss?.toNumber() ?? null,
        takeProfit: p.takeProfit?.toNumber() ?? null,
        marginUsed: p.marginUsed.toNumber(),
        realizedPnl: p.realizedPnl?.toNumber() ?? null,
        closeReason: p.closeReason,
        openedAt: p.openedAt.toISOString(),
        closedAt: p.closedAt?.toISOString() ?? null,
        user: p.user,
      })),
      page,
      limit,
      total,
    );
  }

  async forceClosePosition(id: string, reason: string, ctx: AuditCtx) {
    const closed = await this.trading.forceClose(id, 'ADMIN_FORCE', ctx.adminId);
    await this.audit(this.prisma, {
      adminId: ctx.adminId,
      action: 'POSITION_FORCE_CLOSE',
      targetType: 'position',
      targetId: id,
      metadata: { reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return closed;
  }

  // ---------- Bank accounts ----------
  listBankAccounts() {
    return this.prisma.bankAccount.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBankAccount(dto: BankAccountDto, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({ data: { ...dto, active: dto.active ?? true } });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'BANK_CREATE',
        targetType: 'bank_account',
        targetId: created.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return created;
    });
  }

  async updateBankAccount(id: string, dto: Partial<BankAccountDto>, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bankAccount.update({ where: { id }, data: dto });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'BANK_UPDATE',
        targetType: 'bank_account',
        targetId: id,
        metadata: dto as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return updated;
    });
  }

  async deleteBankAccount(id: string, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id },
        data: { deletedAt: new Date(), active: false },
      });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'BANK_DELETE',
        targetType: 'bank_account',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    });
  }

  // ---------- Audit logs ----------
  async listAuditLogs(page: number, limit: number, adminId?: string, action?: string) {
    const where: Prisma.AdminLogWhereInput = {
      ...(adminId ? { adminId } : {}),
      ...(action ? { action } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { admin: { select: { email: true, fullName: true } } },
      }),
      this.prisma.adminLog.count({ where }),
    ]);
    return paginated(data, page, limit, total);
  }

  // ---------- Tickets ----------
  async listTickets(page: number, limit: number, status?: string) {
    const where: Prisma.SupportTicketWhereInput = {
      deletedAt: null,
      ...(status ? { status: status as Prisma.SupportTicketWhereInput['status'] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, fullName: true } } },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginated(data, page, limit, total);
  }

  async getTicket(id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { user: { select: { email: true, fullName: true } } },
    });
    if (!t || t.deletedAt) throw new NotFoundException();
    return t;
  }

  async addTicketMessage(ticketId: string, message: string, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new NotFoundException();
      const messages = Array.isArray(ticket.messages) ? (ticket.messages as unknown[]) : [];
      const entry = {
        id: crypto.randomUUID(),
        fromAdmin: true,
        authorId: ctx.adminId,
        message,
        createdAt: new Date().toISOString(),
      };
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          messages: [...messages, entry] as Prisma.InputJsonValue,
          status: ticket.status === 'OPEN' ? 'PENDING' : ticket.status,
        },
      });
      await this.notifications.create({
        userId: ticket.userId,
        type: 'TICKET_REPLY',
        title: 'Support replied',
        message: message.slice(0, 200),
        metadata: { ticketId },
        tx,
      });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'TICKET_REPLY',
        targetType: 'ticket',
        targetId: ticketId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return updated;
    });
  }

  async updateTicketStatus(ticketId: string, dto: TicketStatusDto, ctx: AuditCtx) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: dto.status },
      });
      await this.audit(tx, {
        adminId: ctx.adminId,
        action: 'TICKET_STATUS',
        targetType: 'ticket',
        targetId: ticketId,
        metadata: { status: dto.status },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return updated;
    });
  }

  // ---------- Exposure ----------
  async exposure() {
    const rows = await this.prisma.$queryRaw<
      Array<{ symbol: string; net_lots: string; open_positions: bigint }>
    >`
      SELECT symbol,
             SUM(CASE WHEN side = 'BUY' THEN lots ELSE -lots END)::text AS net_lots,
             COUNT(*) AS open_positions
      FROM positions
      WHERE status = 'OPEN'
      GROUP BY symbol
      ORDER BY symbol
    `;
    return rows.map((r) => ({
      symbol: r.symbol,
      netLots: Number(r.net_lots),
      openPositions: Number(r.open_positions),
    }));
  }

  // ---------- Market visibility ----------
  async listAllSymbols() {
    const flags = await Promise.all(
      SYMBOLS.map(async (s) => {
        const v = await this.redis.get(`market:visibility:${s.code}`);
        return v === null || v === '1';
      }),
    );
    return SYMBOLS.map((s, i) => ({
      code: s.code,
      displayName: s.displayName,
      category: s.category,
      digits: s.digits,
      pipSize: s.pipSize,
      contractSize: s.contractSize,
      visible: flags[i],
    }));
  }

  async setSymbolVisibility(symbol: string, dto: VisibilityDto, ctx: AuditCtx) {
    await this.redis.set(`market:visibility:${symbol}`, dto.visible ? '1' : '0');
    await this.audit(this.prisma, {
      adminId: ctx.adminId,
      action: 'MARKET_VISIBILITY',
      targetType: 'symbol',
      targetId: symbol,
      metadata: { visible: dto.visible },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { symbol, visible: dto.visible };
  }

  // ---------- helpers ----------
  private async audit(
    client: Prisma.TransactionClient | PrismaService,
    data: {
      adminId: string;
      action: string;
      targetType?: string;
      targetId?: string;
      metadata?: Record<string, unknown>;
      ip?: string;
      userAgent?: string;
    },
  ) {
    await client.adminLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        metadata: (data.metadata ?? null) as Prisma.InputJsonValue | undefined,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  }

  private emitWallet(
    userId: string,
    wallet: { balance: Prisma.Decimal; marginUsed: Prisma.Decimal },
  ) {
    const free = wallet.balance.minus(wallet.marginUsed);
    this.realtime.emitToUser(userId, 'wallet:updated', {
      balance: wallet.balance.toNumber(),
      equity: wallet.balance.toNumber(),
      freeMargin: free.toNumber(),
      marginLevel: wallet.marginUsed.gt(0)
        ? wallet.balance.div(wallet.marginUsed).mul(100).toNumber()
        : null,
    });
  }
}
