import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { SystemConfigService } from './modules/system-config/system-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Structured logging
  app.useLogger(app.get(Logger));

  // Security
  app.use(helmet());

  // Dynamic CORS: reads allowed origins from DB (system_config key 'cors.origins'),
  // falling back to CORS_ORIGIN env var. A simple 30-second in-memory cache avoids a
  // DB round-trip on every preflight request.
  const systemConfig = app.get(SystemConfigService);
  let cachedOrigins: string[] | null = null;
  let cacheExpiry = 0;

  app.enableCors({
    origin: async (requestOrigin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
      try {
        if (!cachedOrigins || Date.now() > cacheExpiry) {
          const stored = await systemConfig.get('cors.origins');
          const raw = stored || process.env.CORS_ORIGIN || 'http://localhost:5173';
          cachedOrigins = raw.split(',').map((o) => o.trim()).filter(Boolean);
          cacheExpiry = Date.now() + 30_000;
        }
        if (cachedOrigins.includes('*') || !requestOrigin) {
          callback(null, true);
        } else {
          callback(null, cachedOrigins.includes(requestOrigin) ? requestOrigin : false);
        }
      } catch {
        // fallback to env on DB error
        const fallback = process.env.CORS_ORIGIN || 'http://localhost:5173';
        callback(null, !requestOrigin || requestOrigin === fallback);
      }
    },
    credentials: true,
  });

  // Global guards, filters, and interceptors
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('prismalytics API')
    .setDescription('prismalytics BI & Analytics Platform REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication & Authorization')
    .addTag('users', 'User Management')
    .addTag('datasources', 'Data Source Connections')
    .addTag('queries', 'Query Engine')
    .addTag('dashboards', 'Dashboard Management')
    .addTag('visualizations', 'Chart & Visualization Config')
    .addTag('scheduler', 'Job Scheduling')
    .addTag('ai', 'AI / LLM Integration')
    .addTag('tenants', 'Multi-Tenancy')
    .addTag('audit', 'Audit Logging')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Graceful shutdown NestJS calls OnModuleDestroy on all providers on SIGTERM/SIGINT
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`prismalytics API running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
