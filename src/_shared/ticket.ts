import type { ISODate } from './common';

export const TicketStatus = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TicketCategory = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAW: 'WITHDRAW',
  TRADE: 'TRADE',
  ACCOUNT: 'ACCOUNT',
  OTHER: 'OTHER',
} as const;
export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory];

export type TicketMessage = {
  id: string;
  ticketId: string;
  fromAdmin: boolean;
  authorId: string;
  message: string;
  createdAt: ISODate;
};

export type Ticket = {
  id: string;
  userId: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  messages?: TicketMessage[];
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type CreateTicketDTO = {
  subject: string;
  category: TicketCategory;
  message: string;
};
