import type { ISODate } from './common';

export const WalletTxnType = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAW: 'WITHDRAW',
  TRADE_MARGIN_LOCK: 'TRADE_MARGIN_LOCK',
  TRADE_MARGIN_RELEASE: 'TRADE_MARGIN_RELEASE',
  TRADE_PNL: 'TRADE_PNL',
  ADMIN_CREDIT: 'ADMIN_CREDIT',
  ADMIN_DEBIT: 'ADMIN_DEBIT',
  WITHDRAW_REFUND: 'WITHDRAW_REFUND',
} as const;
export type WalletTxnType = (typeof WalletTxnType)[keyof typeof WalletTxnType];

export const DepositStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];

export const WithdrawStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
} as const;
export type WithdrawStatus = (typeof WithdrawStatus)[keyof typeof WithdrawStatus];

export type Wallet = {
  userId: string;
  balance: number;
  equity: number;
  marginUsed: number;
  freeMargin: number;
  unrealizedPnl: number;
  marginLevel: number | null;
  updatedAt: ISODate;
};

export type WalletTransaction = {
  id: string;
  userId: string;
  type: WalletTxnType;
  amount: number;
  balanceAfter: number;
  reference: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: ISODate;
};

export type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string | null;
  active: boolean;
};

export type BankAccountDTO = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  upiId?: string;
  active?: boolean;
};

export type Deposit = {
  id: string;
  userId: string;
  bankAccountId: string;
  amount: number;
  utr: string;
  screenshotUrl: string;
  status: DepositStatus;
  rejectionReason: string | null;
  verifiedById: string | null;
  verifiedAt: ISODate | null;
  createdAt: ISODate;
};

export type CreateDepositDTO = {
  bankAccountId: string;
  amount: number;
  utr: string;
  screenshotUrl: string;
};

export type Withdrawal = {
  id: string;
  userId: string;
  amount: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  status: WithdrawStatus;
  rejectionReason: string | null;
  approvedById: string | null;
  approvedAt: ISODate | null;
  createdAt: ISODate;
};

export type CreateWithdrawalDTO = {
  amount: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
};

export type AdjustWalletDTO = {
  type: typeof WalletTxnType.ADMIN_CREDIT | typeof WalletTxnType.ADMIN_DEBIT;
  amount: number;
  reason: string;
};

export type WalletUpdate = {
  balance: number;
  equity: number;
  freeMargin: number;
  marginLevel: number;
};
