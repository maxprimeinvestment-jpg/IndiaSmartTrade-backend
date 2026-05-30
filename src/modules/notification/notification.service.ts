import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { REALTIME_TOKEN, type RealtimeEmitter } from '../../common/gateway/realtime';

type NotificationType =
  | 'DEPOSIT_APPROVED'
  | 'DEPOSIT_REJECTED'
  | 'WITHDRAW_APPROVED'
  | 'WITHDRAW_REJECTED'
  | 'POSITION_CLOSED'
  | 'ADMIN_MESSAGE'
  | 'TICKET_REPLY'
  | 'SYSTEM';

type CreateInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REALTIME_TOKEN) private readonly realtime: RealtimeEmitter,
  ) {}

  async create(input: CreateInput) {
    const client = input.tx ?? this.prisma;
    const row = await client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue | undefined,
      },
    });
    this.realtime.emitToUser(input.userId, 'notification:new', this.shape(row));
    return row;
  }

  async list(userId: string, page: number, limit: number, unreadOnly = false) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginated(data.map((n) => this.shape(n)), page, limit, total);
  }

  async markRead(userId: string, id: string) {
    const note = await this.prisma.notification.findUnique({ where: { id } });
    if (!note || note.userId !== userId) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  shape(n: {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    metadata: Prisma.JsonValue | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      metadata: n.metadata,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
