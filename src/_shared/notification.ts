import type { ISODate } from './common';

export const NotificationType = {
  DEPOSIT_APPROVED: 'DEPOSIT_APPROVED',
  DEPOSIT_REJECTED: 'DEPOSIT_REJECTED',
  WITHDRAW_APPROVED: 'WITHDRAW_APPROVED',
  WITHDRAW_REJECTED: 'WITHDRAW_REJECTED',
  POSITION_CLOSED: 'POSITION_CLOSED',
  ADMIN_MESSAGE: 'ADMIN_MESSAGE',
  TICKET_REPLY: 'TICKET_REPLY',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  readAt: ISODate | null;
  createdAt: ISODate;
};
