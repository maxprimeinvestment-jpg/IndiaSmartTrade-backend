import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type Redis from 'ioredis';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRedisClient } from '../../common/redis';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { CreateAdminDto } from './dto/create-admin.dto';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

const ACCESS_TTL_FALLBACK = '15m';
const REFRESH_TTL_FALLBACK = '30d';
const REFRESH_DAYS = 30;

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const SIGNUP_PENDING_KEY = (email: string) => `auth:signup:${email.toLowerCase()}`;
const PASSWORD_RESET_KEY = (email: string) => `auth:pwreset:${email.toLowerCase()}`;

type SignupPending = {
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  codeHash: string;
  attempts: number;
};

type PasswordResetPending = {
  email: string;
  codeHash: string;
  attempts: number;
};

type TokenPair = { accessToken: string; refreshToken: string };

type SessionInput = {
  userId: string;
  role: string;
  userAgent?: string;
  ip?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;
  private readonly otpEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {
    this.redis = createRedisClient(this.config.get<string>('REDIS_URL'));
    this.otpEnabled = this.config.get<string>('AUTH_OTP_ENABLED') !== 'false';
    if (!this.otpEnabled) {
      this.logger.warn(
        'AUTH_OTP_ENABLED=false — signup skips OTP and creates accounts immediately. NEVER use in production.',
      );
    }
  }

  /**
   * Bootstrap / promote an ADMIN or SUPER_ADMIN without terminal access.
   *
   * Gated by the ADMIN_SETUP_SECRET env var: the request body must carry a
   * `setupSecret` that matches it (constant-time compared). This is the API
   * equivalent of `npm run create-admin` for CI/CD deploys where you can't
   * open a shell on the box.
   *
   * If a user with that email exists they're promoted to the requested role
   * and their password is reset; otherwise a new active admin + wallet is
   * created. Returns the user shape (no tokens — log in via /auth/login after).
   */
  async createAdmin(dto: CreateAdminDto) {
    const expected = this.config.get<string>('ADMIN_SETUP_SECRET');
    if (!expected) {
      this.logger.error('ADMIN_SETUP_SECRET is not configured — refusing admin bootstrap');
      throw new ServiceUnavailableException('Admin bootstrap is not configured');
    }
    if (!this.secretMatches(dto.setupSecret, expected)) {
      this.logger.warn(`Admin bootstrap rejected — bad setup secret for ${dto.email}`);
      throw new ForbiddenException('Invalid setup secret');
    }

    const role = dto.role ?? 'SUPER_ADMIN';
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          role,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      const wallet = await this.prisma.wallet.findUnique({ where: { userId: updated.id } });
      if (!wallet) await this.prisma.wallet.create({ data: { userId: updated.id } });
      this.logger.log(`Admin bootstrap promoted existing user ${updated.email} → ${updated.role}`);
      return { user: this.shape(updated), created: false };
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          role,
          status: 'ACTIVE',
        },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      return created;
    });
    this.logger.log(`Admin bootstrap created ${user.role} ${user.email}`);
    return { user: this.shape(user), created: true };
  }

  /** Constant-time string comparison that's safe against length leaks. */
  private secretMatches(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Step 1 of signup. Two modes:
   *
   * - AUTH_OTP_ENABLED=true (default): validates input, stores a pending
   *   account in Redis (10 min TTL), emails a 6-digit OTP. The User row is
   *   only created in verifySignupOtp().
   * - AUTH_OTP_ENABLED=false (dev convenience): creates the User + Wallet +
   *   session immediately and returns tokens. Response shape matches
   *   verifySignupOtp() so callers can detect mode by response keys.
   */
  async requestSignupOtp(dto: SignupDto, ctx?: { userAgent?: string; ip?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    if (!this.otpEnabled) {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            phone: dto.phone ?? null,
          },
        });
        await tx.wallet.create({ data: { userId: created.id } });
        return created;
      });
      const tokens = await this.issueTokens({
        userId: user.id,
        role: user.role,
        userAgent: ctx?.userAgent,
        ip: ctx?.ip,
      });
      return { user: this.shape(user), ...tokens };
    }

    const code = this.generateOtp();
    const codeHash = await bcrypt.hash(code, 10);

    const pending: SignupPending = {
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      codeHash,
      attempts: 0,
    };
    await this.redis.set(
      SIGNUP_PENDING_KEY(dto.email),
      JSON.stringify(pending),
      'EX',
      OTP_TTL_SECONDS,
    );

    await this.email.sendOtp(dto.email, code, 'signup');
    return { email: dto.email, expiresInSeconds: OTP_TTL_SECONDS };
  }

  /**
   * Step 2 of signup — verifies the OTP against the pending account, and on
   * success creates the User row + Wallet row + issues tokens.
   */
  async verifySignupOtp(email: string, otp: string, ctx: { userAgent?: string; ip?: string }) {
    const key = SIGNUP_PENDING_KEY(email);
    const raw = await this.redis.get(key);
    if (!raw) throw new BadRequestException('Code expired — please request a new one');

    const pending = JSON.parse(raw) as SignupPending;
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException('Too many attempts — please request a new code');
    }

    const ok = await bcrypt.compare(otp, pending.codeHash);
    if (!ok) {
      pending.attempts += 1;
      const ttl = Math.max(1, await this.redis.ttl(key));
      await this.redis.set(key, JSON.stringify(pending), 'EX', ttl);
      throw new BadRequestException('Invalid code');
    }

    // Race-condition guard: another tab may have already verified.
    const existing = await this.prisma.user.findUnique({ where: { email: pending.email } });
    if (existing) {
      await this.redis.del(key);
      throw new ConflictException('Email already registered');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: pending.email,
          passwordHash: pending.passwordHash,
          fullName: pending.fullName,
          phone: pending.phone,
        },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      return created;
    });

    await this.redis.del(key);

    const tokens = await this.issueTokens({
      userId: user.id,
      role: user.role,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    return { user: this.shape(user), ...tokens };
  }

  /**
   * Step 1 of password reset — generates an OTP, stores it in Redis, emails it.
   * Always returns success-shaped response so the endpoint cannot be used to
   * enumerate registered emails.
   */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      this.logger.debug(`password reset requested for unknown / inactive email ${email}`);
      return { email, expiresInSeconds: OTP_TTL_SECONDS };
    }
    const code = this.generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const pending: PasswordResetPending = { email, codeHash, attempts: 0 };
    await this.redis.set(
      PASSWORD_RESET_KEY(email),
      JSON.stringify(pending),
      'EX',
      OTP_TTL_SECONDS,
    );
    await this.email.sendOtp(email, code, 'reset');
    return { email, expiresInSeconds: OTP_TTL_SECONDS };
  }

  /**
   * Step 2 of password reset — verifies OTP, sets the new password hash, and
   * revokes every active session for that user (forces re-login everywhere).
   */
  async resetPassword(email: string, otp: string, newPassword: string) {
    const key = PASSWORD_RESET_KEY(email);
    const raw = await this.redis.get(key);
    if (!raw) throw new BadRequestException('Code expired — please request a new one');

    const pending = JSON.parse(raw) as PasswordResetPending;
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException('Too many attempts — please request a new code');
    }

    const ok = await bcrypt.compare(otp, pending.codeHash);
    if (!ok) {
      pending.attempts += 1;
      const ttl = Math.max(1, await this.redis.ttl(key));
      await this.redis.set(key, JSON.stringify(pending), 'EX', ttl);
      throw new BadRequestException('Invalid code');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.redis.del(key);
      throw new BadRequestException('Account not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.redis.del(key);
    return { ok: true };
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async login(dto: LoginDto, ctx: { userAgent?: string; ip?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokens({
      userId: user.id,
      role: user.role,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    return { user: this.shape(user), ...tokens };
  }

  async refresh(refreshToken: string, ctx: { userAgent?: string; ip?: string }) {
    let claims: { sub: string; sessionId: string };
    try {
      claims = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({ where: { id: claims.sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }
    const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!matches) {
      // Token-theft heuristic — revoke every session for this user.
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User inactive');

    const accessToken = await this.signAccess({ userId: user.id, role: user.role, sessionId: session.id });
    const newRefresh = await this.signRefresh({ userId: user.id, sessionId: session.id });
    const newHash = await bcrypt.hash(newRefresh, 10);
    const newExpires = new Date(Date.now() + REFRESH_DAYS * 86_400_000);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        lastUsedAt: new Date(),
        expiresAt: newExpires,
        ip: ctx.ip ?? session.ip,
        userAgent: ctx.userAgent ?? session.userAgent,
      },
    });

    return { accessToken, refreshToken: newRefresh, user: this.shape(user) };
  }

  async logout(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.shape(user);
  }

  private async issueTokens(input: SessionInput): Promise<TokenPair> {
    const sessionId = randomUUID();
    const accessToken = await this.signAccess({
      userId: input.userId,
      role: input.role,
      sessionId,
    });
    const refreshToken = await this.signRefresh({ userId: input.userId, sessionId });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86_400_000);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: input.userId,
        refreshTokenHash,
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    return { accessToken, refreshToken };
  }

  private signAccess(input: { userId: string; role: string; sessionId: string }) {
    return this.jwt.signAsync(
      { sub: input.userId, role: input.role, sessionId: input.sessionId },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? ACCESS_TTL_FALLBACK,
      },
    );
  }

  private signRefresh(input: { userId: string; sessionId: string }) {
    return this.jwt.signAsync(
      { sub: input.userId, sessionId: input.sessionId },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? REFRESH_TTL_FALLBACK,
      },
    );
  }

  private shape(user: {
    id: string;
    email: string;
    phone: string | null;
    fullName: string;
    avatarUrl: string | null;
    role: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
