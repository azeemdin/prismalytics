import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities';

@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  create(@Req() req: any, @Body() dto: { name: string; expiresInDays?: number }) {
    return this.apiKeysService.create(req.user.tenantId, req.user.sub, dto);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.apiKeysService.findAll(req.user.tenantId, req.user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Req() req: any, @Param('id') id: string) {
    return this.apiKeysService.delete(id, req.user.tenantId, req.user.sub);
  }
}
