import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';

type StoredMessage = {
  id: string;
  fromAdmin: boolean;
  authorId: string;
  message: string;
  createdAt: string;
};

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTicketDto) {
    const firstMessage: StoredMessage = {
      id: randomUUID(),
      fromAdmin: false,
      authorId: userId,
      message: dto.message,
      createdAt: new Date().toISOString(),
    };
    const t = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        category: dto.category,
        status: 'OPEN',
        messages: [firstMessage] as Prisma.InputJsonValue,
      },
    });
    return this.shape(t);
  }

  async list(userId: string, page: number, limit: number, status?: string) {
    const where: Prisma.SupportTicketWhereInput = {
      userId,
      deletedAt: null,
      ...(status ? { status: status as Prisma.SupportTicketWhereInput['status'] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginated(data.map((t) => this.shape(t)), page, limit, total);
  }

  async getOne(userId: string, id: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t || t.deletedAt) throw new NotFoundException();
    if (t.userId !== userId) throw new ForbiddenException();
    return this.shape(t);
  }

  async addMessage(userId: string, ticketId: string, message: string) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket || ticket.deletedAt) throw new NotFoundException();
      if (ticket.userId !== userId) throw new ForbiddenException();
      if (ticket.status === 'CLOSED') {
        throw new ForbiddenException('Ticket is closed. Open a new ticket if you need more help.');
      }
      const messages = Array.isArray(ticket.messages) ? (ticket.messages as unknown[]) : [];
      const entry: StoredMessage = {
        id: randomUUID(),
        fromAdmin: false,
        authorId: userId,
        message,
        createdAt: new Date().toISOString(),
      };
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          messages: [...messages, entry] as Prisma.InputJsonValue,
          status: ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status,
        },
      });
      return this.shape(updated);
    });
  }

  private shape(t: {
    id: string;
    userId: string;
    subject: string;
    category: string;
    status: string;
    messages: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const messages = Array.isArray(t.messages)
      ? (t.messages as unknown as StoredMessage[])
      : [];
    return {
      id: t.id,
      userId: t.userId,
      subject: t.subject,
      category: t.category,
      status: t.status,
      messages,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
