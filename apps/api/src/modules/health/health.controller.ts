import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import IORedis from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { CacheService } from '../cache/cache.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly cacheService: CacheService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check database, queue, and cache status' })
  async check() {
    const [dbStatus, queueStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkQueue(),
    ]);

    const overall = dbStatus === 'ok' ? 'ok' : 'degraded';

    const body = {
      status: overall,
      service: 'prismalytics-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        queue: queueStatus,
        cache: this.cacheService.isEnabled() ? 'ok' : 'disabled',
      },
    };

    if (overall !== 'ok') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return body;
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.db.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkQueue(): Promise<'ok' | 'error' | 'disabled'> {
    const host = this.config.get<string>('REDIS_HOST');
    const port = this.config.get<number>('REDIS_PORT') ?? 6379;
    if (!host) return 'disabled';

    const redis = new IORedis({
      host,
      port,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    try {
      await redis.ping();
      return 'ok';
    } catch {
      return 'error';
    } finally {
      redis.disconnect();
    }
  }
}
