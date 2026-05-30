import type { ISODate } from './common';

export const OrderSide = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;
export type OrderSide = (typeof OrderSide)[keyof typeof OrderSide];

export const PositionStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type PositionStatus = (typeof PositionStatus)[keyof typeof PositionStatus];

export const PositionCloseReason = {
  USER: 'USER',
  STOP_LOSS: 'STOP_LOSS',
  TAKE_PROFIT: 'TAKE_PROFIT',
  ADMIN_FORCE: 'ADMIN_FORCE',
  LIQUIDATION: 'LIQUIDATION',
} as const;
export type PositionCloseReason =
  (typeof PositionCloseReason)[keyof typeof PositionCloseReason];

export type Position = {
  id: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  status: PositionStatus;
  lots: number;
  leverage: number;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  marginUsed: number;
  realizedPnl: number | null;
  unrealizedPnl: number;
  closeReason: PositionCloseReason | null;
  openedAt: ISODate;
  closedAt: ISODate | null;
};

export type TradeHistoryEntry = {
  id: string;
  positionId: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  lots: number;
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  closeReason: PositionCloseReason;
  openedAt: ISODate;
  closedAt: ISODate;
};

export type OpenPositionDTO = {
  symbol: string;
  side: OrderSide;
  lots: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
};

export type UpdateSlTpDTO = {
  stopLoss?: number | null;
  takeProfit?: number | null;
};

export type PnlUpdate = {
  positionId: string;
  currentPrice: number;
  unrealizedPnl: number;
  marginLevel: number;
};
