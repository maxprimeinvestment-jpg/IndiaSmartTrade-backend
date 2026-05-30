import type { Quote } from './market';
import type { Position, PnlUpdate } from './trade';
import type { WalletUpdate, Deposit, Withdrawal } from './wallet';
import type { Notification } from './notification';

export const WsEvents = {
  // S → C — market
  QUOTE_TICK: 'quote:tick',
  QUOTE_BATCH: 'quote:batch',

  // S → C — user-scoped
  POSITION_OPENED: 'position:opened',
  POSITION_PNL_UPDATE: 'position:pnl_update',
  POSITION_CLOSED: 'position:closed',
  WALLET_UPDATED: 'wallet:updated',
  NOTIFICATION_NEW: 'notification:new',
  DEPOSIT_STATUS_CHANGED: 'deposit:status_changed',
  WITHDRAW_STATUS_CHANGED: 'withdraw:status_changed',

  // S → C — admin-scoped
  ADMIN_EXPOSURE_UPDATE: 'admin:exposure_update',
  ADMIN_USER_EVENT: 'admin:user_event',

  // C → S
  SUBSCRIBE_SYMBOLS: 'subscribe:symbols',
  UNSUBSCRIBE_SYMBOLS: 'unsubscribe:symbols',
} as const;
export type WsEvent = (typeof WsEvents)[keyof typeof WsEvents];

export type ServerToClientEvents = {
  [WsEvents.QUOTE_TICK]: (payload: Quote) => void;
  [WsEvents.QUOTE_BATCH]: (payload: { ticks: Quote[] }) => void;

  [WsEvents.POSITION_OPENED]: (payload: Position) => void;
  [WsEvents.POSITION_PNL_UPDATE]: (payload: PnlUpdate) => void;
  [WsEvents.POSITION_CLOSED]: (payload: Position) => void;
  [WsEvents.WALLET_UPDATED]: (payload: WalletUpdate) => void;
  [WsEvents.NOTIFICATION_NEW]: (payload: Notification) => void;
  [WsEvents.DEPOSIT_STATUS_CHANGED]: (payload: Deposit) => void;
  [WsEvents.WITHDRAW_STATUS_CHANGED]: (payload: Withdrawal) => void;

  [WsEvents.ADMIN_EXPOSURE_UPDATE]: (payload: {
    symbol: string;
    netLots: number;
    openPositions: number;
  }) => void;
  [WsEvents.ADMIN_USER_EVENT]: (payload: {
    userId: string;
    type: 'SIGNUP' | 'DEPOSIT_REQUEST' | 'WITHDRAW_REQUEST' | 'TICKET_OPENED';
  }) => void;
};

export type ClientToServerEvents = {
  [WsEvents.SUBSCRIBE_SYMBOLS]: (payload: { symbols: string[] }) => void;
  [WsEvents.UNSUBSCRIBE_SYMBOLS]: (payload: { symbols: string[] }) => void;
};
