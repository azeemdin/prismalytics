import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import IORedis from 'ioredis';
import { SystemConfigService } from '../system-config/system-config.service';
import { ConfigService } from '@nestjs/config';

const CONFIG_KEYS = [
  'cache.enabled',
  'cache.redis.host',
  'cache.redis.port',
  'cache.redis.password',
  'cache.ttl',
] as const;

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: IORedis | null = null;
  private _enabled = false;
  private defaultTtl = 300;

  constructor(
    private readonly sysConfig: SystemConfigService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const cfg = await this.sysConfig.getMany([...CONFIG_KEYS]);

    this._enabled = cfg['cache.enabled'] === 'true';
    this.defaultTtl = cfg['cache.ttl'] ? parseInt(cfg['cache.ttl']!, 10) : 300;

    if (!this._enabled) {
      this.logger.log('Query result cache disabled');
      return;
    }

    // DB config takes priority; fall back to the same env vars used by the scheduler/alerts queues
    const host = cfg['cache.redis.host'] ?? this.config.get<string>('REDIS_HOST') ?? 'localhost';
    const port = cfg['cache.redis.port']
      ? parseInt(cfg['cache.redis.port']!, 10)
      : (this.config.get<number>('REDIS_PORT') ?? 6379);
    const password = cfg['cache.redis.password'] || undefined;

    try {
      const redis = new IORedis({
        host,
        port,
        password,
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      await redis.connect();
      await redis.ping();
      if (this.client) await this.client.quit().catch(() => {});
      this.client = redis;
      this.logger.log(`Cache Redis connected at ${host}:${port}`);
    } catch (err) {
      this.logger.warn(
        `Cache Redis connection failed: ${(err as Error).message} — cache disabled`,
      );
      this._enabled = false;
    }
  }

  isEnabled(): boolean {
    return this._enabled && this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isEnabled()) return null;
    try {
      return await this.client!.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.client!.set(key, value, 'EX', ttlSeconds ?? this.defaultTtl);
    } catch {
      // non-fatal — cache write failures don't block query results
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.client!.del(key);
    } catch {
      // ignore
    }
  }

  async reload(): Promise<{ enabled: boolean; message: string }> {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.client = null;
    }
    this._enabled = false;
    await this.initialize();
    return {
      enabled: this.isEnabled(),
      message: this.isEnabled() ? 'Cache connected successfully' : 'Cache disabled or connection failed',
    };
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  static buildKey(
    datasourceId: string,
    sql: string,
    params?: Record<string, unknown>,
  ): string {
    const raw = `${datasourceId}:${sql}:${JSON.stringify(params ?? {})}`;
    return `q:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
  }
}
