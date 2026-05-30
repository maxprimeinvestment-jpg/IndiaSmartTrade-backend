import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createRedisClient } from '../../common/redis';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — checks DB and Redis' })
  async readiness() {
    const checks = await Promise.allSettled([this.checkDb(), this.checkRedis()]);
    const db = checks[0].status === 'fulfilled';
    const redis = checks[1].status === 'fulfilled';
    const ok = db && redis;
    return {
      status: ok ? 'ok' : 'degraded',
      db,
      redis,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb() {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkRedis() {
    const client = createRedisClient(this.config.get<string>('REDIS_URL'), {
      lazyConnect: true,
      // Bound the readiness probe so a dead Redis can't hang the request.
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
      const reply = await client.ping();
      if (reply !== 'PONG') throw new Error('Bad PING reply');
    } finally {
      client.disconnect();
    }
  }
}
