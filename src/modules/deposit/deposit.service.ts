import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { NotificationService } from '../notification/notification.service';
import type { CreateDepositDto } from './dto/create-deposit.dto';

@Injectable()
export class DepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  listBankAccounts() {
    return this.prisma.bankAccount.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateDepositDto) {
    const bank = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
    if (!bank || !bank.active || bank.deletedAt) {
      throw new BadRequestException('Bank account is not available');
    }
    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        bankAccountId: dto.bankAccountId,
        amount: new Prisma.Decimal(dto.amount),
        utr: dto.utr,
        screenshotUrl: dto.screenshotUrl,
      },
    });
    await this.notifications.create({
      userId,
      type: 'SYSTEM',
      title: 'Deposit submitted',
      message: `Your deposit of ${dto.amount} is awaiting verification.`,
      metadata: { depositId: deposit.id },
    });
    return this.shape(deposit);
  }

  async list(userId: string, page: number, limit: number, status?: string) {
    const where: Prisma.DepositWhereInput = {
      userId,
      ...(status ? { status: status as Prisma.DepositWhereInput['status'] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deposit.count({ where }),
    ]);
    return paginated(data.map((d) => this.shape(d)), page, limit, total);
  }

  async getOne(userId: string, id: string) {
    const d = await this.prisma.deposit.findUnique({ where: { id } });
    if (!d || d.userId !== userId) throw new NotFoundException('Deposit not found');
    return this.shape(d);
  }

  shape(d: {
    id: string;
    userId: string;
    bankAccountId: string;
    amount: Prisma.Decimal;
    utr: string;
    screenshotUrl: string;
    status: string;
    rejectionReason: string | null;
    verifiedById: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: d.id,
      userId: d.userId,
      bankAccountId: d.bankAccountId,
      amount: d.amount.toNumber(),
      utr: d.utr,
      screenshotUrl: d.screenshotUrl,
      status: d.status,
      rejectionReason: d.rejectionReason,
      verifiedById: d.verifiedById,
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
