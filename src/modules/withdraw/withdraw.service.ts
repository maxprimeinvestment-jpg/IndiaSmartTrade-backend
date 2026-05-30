import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { REALTIME_TOKEN, type RealtimeEmitter } from '../../common/gateway/realtime';
import { NotificationService } from '../notification/notification.service';
import type { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Inject(REALTIME_TOKEN) private readonly realtime: RealtimeEmitter,
  ) {}

  async create(userId: string, dto: CreateWithdrawalDto) {
    const amount = new Prisma.Decimal(dto.amount);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new BadRequestException('Wallet missing');
        const free = wallet.balance.minus(wallet.marginUsed);
        if (free.lt(amount)) throw new BadRequestException('Insufficient free margin');
        const newBalance = wallet.balance.minus(amount);
        await tx.wallet.update({ where: { userId }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            userId,
            type: 'WITHDRAW',
            amount: amount.neg(),
            balanceAfter: newBalance,
            reference: 'withdrawal-request',
          },
        });
        const w = await tx.withdrawal.create({
          data: {
            userId,
            amount,
            bankName: dto.bankName,
            accountName: dto.accountName,
            accountNumber: dto.accountNumber,
            ifsc: dto.ifsc,
          },
        });
        await this.notifications.create({
          userId,
          type: 'SYSTEM',
          title: 'Withdrawal requested',
          message: `Your withdrawal of ${dto.amount} is pending review.`,
          metadata: { withdrawalId: w.id },
          tx,
        });
        return { wallet: { ...wallet, balance: newBalance }, withdrawal: w };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.emitWalletSnapshot(userId, result.wallet);
    return this.shape(result.withdrawal);
  }

  async list(userId: string, page: number, limit: number, status?: string) {
    const where: Prisma.WithdrawalWhereInput = {
      userId,
      ...(status ? { status: status as Prisma.WithdrawalWhereInput['status'] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.withdrawal.count({ where }),
    ]);
    return paginated(data.map((w) => this.shape(w)), page, limit, total);
  }

  shape(w: {
    id: string;
    userId: string;
    amount: Prisma.Decimal;
    bankName: string;
    accountName: string;
    accountNumber: string;
    ifsc: string;
    status: string;
    rejectionReason: string | null;
    approvedById: string | null;
    approvedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: w.id,
      userId: w.userId,
      amount: w.amount.toNumber(),
      bankName: w.bankName,
      accountName: w.accountName,
      accountNumber: w.accountNumber,
      ifsc: w.ifsc,
      status: w.status,
      rejectionReason: w.rejectionReason,
      approvedById: w.approvedById,
      approvedAt: w.approvedAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
    };
  }

  private emitWalletSnapshot(
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
