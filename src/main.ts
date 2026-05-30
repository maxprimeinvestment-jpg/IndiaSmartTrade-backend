import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { Logger as PinoLogger } from "nestjs-pino";
import compression from "compression";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  // Raw console markers (bypass Nest's buffered logger) so we can see exactly
  // how far boot gets even if the Nest logger never initializes.
  console.log("[boot] creating Nest application…");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  console.log("[boot] Nest application created");
  app.useLogger(app.get(PinoLogger));
  console.log("[boot] logger attached");

  const config = app.get(ConfigService);
  const isProd = config.get<string>("NODE_ENV") === "production";

  // Security headers — relax CSP slightly so Swagger UI can still load.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  // Compress JSON / SSE payloads — skip the WebSocket upgrade traffic.
  app.use(compression());

  // Trust the first proxy hop so req.ip / X-Forwarded-For work behind nginx.
  app.set("trust proxy", 1);

  const corsOrigins = (config.get<string>("CORS_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Allow all cross-origin requests by default. We reflect the request's Origin
  // header (rather than '*') because '*' is rejected by browsers when
  // credentials: true. Set CORS_ORIGINS to a comma-separated list to restrict.
  const allowAll = corsOrigins.length === 0 || corsOrigins.includes("*");

  app.enableCors({
    origin: allowAll ? true : corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Disposition"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // forbidNonWhitelisted intentionally off: several controllers combine
      // @Query() <PaginationDto> with @Query('status') for filter values,
      // which would otherwise be rejected. `whitelist: true` still strips
      // unknown fields off DTOs, preserving the security guarantee.
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // Graceful shutdown — Nest fires onModuleDestroy hooks on SIGINT/SIGTERM.
  app.enableShutdownHooks();

  // Swagger only in non-prod by default; expose under /docs.
  if (!isProd || config.get<string>("SWAGGER_ENABLED") === "true") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("IndiaSmartTrade API")
      .setDescription(
        "REST + WebSocket API for the IndiaSmartTrade trading simulation platform.",
      )
      .setVersion("1.0.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = Number(config.get<string>("PORT") ?? 4000);
  console.log(`[boot] calling listen on 0.0.0.0:${port}…`);
  await app.listen(port, "0.0.0.0");
  console.log(`[boot] listening on :${port}`);
  new Logger("Bootstrap").log(
    `IndiaSmartTrade API listening on :${port} (env=${config.get("NODE_ENV")}, market=${config.get("MARKET_PROVIDER") ?? "mock"})`,
  );
}

// Surface anything that would otherwise die silently.
process.on("unhandledRejection", (reason) => {
  console.error("[boot] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[boot] uncaughtException:", err);
});

bootstrap().catch((err) => {
  // Print the FULL error (stack included), not just .message — and via console
  // so it isn't swallowed by Nest's log buffer when boot fails early.
  console.error("[boot] FATAL — failed to start:", err);
  process.exit(1);
});
