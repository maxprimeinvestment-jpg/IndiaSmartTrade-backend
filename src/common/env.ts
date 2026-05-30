import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

const SHORT_SECRET_THRESHOLD = 16;

export class EnvSchema {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV!: 'development' | 'production' | 'test';

  @IsInt()
  PORT: number = 4000;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(1)
  REDIS_URL!: string;

  @IsString()
  @MinLength(SHORT_SECRET_THRESHOLD)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(SHORT_SECRET_THRESHOLD)
  JWT_REFRESH_SECRET!: string;

  @IsOptional() @IsString() JWT_ACCESS_TTL?: string;
  @IsOptional() @IsString() JWT_REFRESH_TTL?: string;
  @IsOptional() @IsString() CORS_ORIGINS?: string;
  @IsOptional() @IsString() MARKET_PROVIDER?: string;
  @IsOptional() @IsString() MARKET_API_KEY?: string;
  @IsOptional() @IsString() CLOUDINARY_CLOUD_NAME?: string;
  @IsOptional() @IsString() CLOUDINARY_API_KEY?: string;
  @IsOptional() @IsString() CLOUDINARY_API_SECRET?: string;
  @IsOptional() @IsString() CLOUDINARY_UPLOAD_PRESET?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const env = plainToInstance(EnvSchema, raw, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const summary = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${summary}`);
  }
  if (env.NODE_ENV === 'production') {
    const insecureSecrets = [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET].filter((s) =>
      /replace[-_]?me/i.test(s),
    );
    if (insecureSecrets.length > 0) {
      new Logger('Env').error(
        'JWT secrets still contain placeholder values in production — rotate JWT_ACCESS_SECRET and JWT_REFRESH_SECRET before exposing the API.',
      );
      throw new Error('Refusing to boot with placeholder JWT secrets in production');
    }
  }
  return env;
}
