import type { ISODate } from './common';

export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  FROZEN: 'FROZEN',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export type User = {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type SignupDTO = {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
};

export type LoginDTO = {
  email: string;
  password: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = AuthTokens & {
  user: User;
};

export type UpdateProfileDTO = {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
};
