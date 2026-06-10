import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities';
import { CacheService } from './cache.service';

@ApiTags('cache')
@ApiBearerAuth()
@Controller('cache')
export class CacheController {
  constructor(private readonly cacheService: CacheService) {}

  @Post('reload')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reload cache connection from current DB settings (admin)' })
  async reload() {
    return this.cacheService.reload();
  }
}
