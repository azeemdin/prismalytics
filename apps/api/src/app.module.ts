import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import * as Joi from 'joi';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';

// Module imports
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { DatasourcesModule } from './modules/datasources/datasources.module';
import { QueriesModule } from './modules/queries/queries.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { VisualizationsModule } from './modules/visualizations/visualizations.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { AiModule } from './modules/ai/ai.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { HealthModule } from './modules/health/health.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { CacheModule } from './modules/cache/cache.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { SearchModule } from './modules/search/search.module';
import { TeamModule } from './modules/team/team.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    // â”€â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        // Server
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),

        // Database
        DB_TYPE: Joi.string().valid('sqlite', 'postgres').default('sqlite'),
        DB_PATH: Joi.string().default('/data/prismalytics.db'),
        DB_HOST: Joi.string().default('localhost'),
        DB_PORT: Joi.number().default(5432),
        DB_USERNAME: Joi.string().default('prismalytics'),
        DB_PASSWORD: Joi.string().default('prismalytics'),
        DB_DATABASE: Joi.string().default('prismalytics'),
        DB_SYNCHRONIZE: Joi.string().valid('true', 'false').default('true'),

        // Redis (BullMQ optional in dev; queues degrade gracefully)
        REDIS_HOST: Joi.string().allow('').optional(),
        REDIS_PORT: Joi.number().default(6379),

        // JWT (used for local auth; not required when Keycloak is the sole auth provider)
        JWT_SECRET: Joi.string().allow('').default('prismalytics-dev-secret-change-in-prod'),
        JWT_EXPIRATION: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),

        // Keycloak
        KEYCLOAK_URL: Joi.string().allow('').optional(),
        KEYCLOAK_REALM: Joi.string().default('prismalytics'),
        KEYCLOAK_CLIENT_ID: Joi.string().default('prismalytics-app'),
        KEYCLOAK_CLIENT_SECRET: Joi.string().allow('').optional(),
        KEYCLOAK_REDIRECT_URI: Joi.string().default('http://localhost:5173/auth/callback'),

        // AI / LLM
        AI_TIMEOUT: Joi.number().default(60),
        AI_DEFAULT_PROVIDER: Joi.string().default('gemini'),
        GEMINI_API_KEY: Joi.string().allow('').optional(),
        GEMINI_MODEL: Joi.string().default('gemini-1.5-flash-latest'),
        CLAUDE_API_KEY: Joi.string().allow('').optional(),
        CLAUDE_MODEL: Joi.string().default('claude-haiku-4-5-20251001'),
        OPENROUTER_API_KEY: Joi.string().allow('').optional(),
        OPENROUTER_MODEL: Joi.string().default('openai/gpt-4o-mini'),
        OLLAMA_BASE_URL: Joi.string().allow('').optional(),
        OLLAMA_MODEL: Joi.string().default('llama3.2'),

        // SMTP (for scheduled job email notifications)
        SMTP_HOST: Joi.string().allow('').optional(),
        SMTP_PORT: Joi.number().default(587),
        SMTP_SECURE: Joi.boolean().default(false),
        SMTP_USER: Joi.string().allow('').optional(),
        SMTP_PASS: Joi.string().allow('').optional(),
        SMTP_FROM: Joi.string().allow('').optional(),

        // CORS
        CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
      }),
    }),

    // â”€â”€â”€ Logging with correlation IDs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    LoggerModule.forRoot({
      pinoHttp: {
        // Pick up x-request-id from RequestIdMiddleware (runs before pino)
        genReqId: (req: IncomingMessage) =>
          (req as IncomingMessage & { requestId?: string }).requestId ??
          (req.headers['x-request-id'] as string | undefined) ??
          randomUUID(),
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      },
    }),

    // â”€â”€â”€ Database â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = (config.get<string>('DB_TYPE') ?? 'sqlite').toLowerCase();
        const isDev = config.get<string>('NODE_ENV') === 'development';
        // DB_SYNCHRONIZE defaults to true so a fresh PostgreSQL database gets its schema
        // created on first boot. Set DB_SYNCHRONIZE=false once migrations are in use.
        const synchronize = config.get<string>('DB_SYNCHRONIZE') !== 'false';
        if (dbType === 'sqlite') {
          return {
            type: 'better-sqlite3' as const,
            database: config.get<string>('DB_PATH') ?? '/data/prismalytics.db',
            autoLoadEntities: true,
            synchronize: true,
            logging: isDev,
          };
        }
        return {
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT'),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_DATABASE'),
          autoLoadEntities: true,
          synchronize,
          logging: isDev,
        };
      },
    }),

    // â”€â”€â”€ Feature Modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    HealthModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    DatasourcesModule,
    QueriesModule,
    DashboardsModule,
    VisualizationsModule,
    SchedulerModule,
    NotificationsModule,
    AuditModule,
    AiModule,
    PluginsModule,
    AlertsModule,
    ApiKeysModule,
    SystemConfigModule,
    CacheModule,
    MetricsModule,
    SearchModule,
    TeamModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
