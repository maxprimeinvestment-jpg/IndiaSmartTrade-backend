import type { UserRole, UserStatus } from '@shared/auth';

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  sessionId: string;
};
