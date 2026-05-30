import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './common/gateway/realtime.module';
import { validateEnv } from './common/env';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { DepositModule } from './modules/deposit/deposit.module';
import { WithdrawModule } from './modules/withdraw/withdraw.module';
import { TradingModule } from './modules/trading/trading.module';
import { PositionsModule } from './modules/positions/positions.module';
import { HistoryModule } from './modules/history/history.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationModule } from './modules/notification/notification.module';
import { UploadModule } from './modules/upload/upload.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => validateEnv(config) as unknown as Record<string, unknown>,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // pino-pretty runs in a worker thread (thread-stream), which can hang or
        // fail to spawn in some container runtimes — and on Railway that hang
        // happens during boot, before the HTTP server starts, so the healthcheck
        // fails with no visible error. Make it strictly opt-in via LOG_PRETTY=true
        // (local dev only). Everywhere else we emit plain JSON straight to stdout,
        // which never blocks.
        transport:
          process.env.LOG_PRETTY === 'true'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    EmailModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MarketDataModule.register(),
    PositionsModule,
    TradingModule,
    HistoryModule,
    WalletModule,
    NotificationModule,
    DepositModule,
    WithdrawModule,
    UploadModule,
    TicketsModule,
    AdminModule,
    RealtimeModule,
  ],
})
export class AppModule {}
