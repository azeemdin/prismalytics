import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SystemConfigModule } from '../system-config/system-config.module';
import { CacheService } from './cache.service';
import { CacheController } from './cache.controller';

@Global()
@Module({
  imports: [ConfigModule, SystemConfigModule],
  providers: [CacheService],
  controllers: [CacheController],
  exports: [CacheService],
})
export class CacheModule {}
