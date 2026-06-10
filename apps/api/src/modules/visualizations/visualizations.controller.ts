import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VisualizationsService } from './visualizations.service';
import { CreateVisualizationDto, UpdateVisualizationDto } from './dto/visualization.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@ApiTags('visualizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('visualizations')
export class VisualizationsController {
  constructor(private readonly vizsService: VisualizationsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Create a visualization (dashboardId optional — omit for chart library)' })
  create(@CurrentUser() user: User, @Body() dto: CreateVisualizationDto) {
    return this.vizsService.create(user.tenantId, dto);
  }

  @Get('library')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'List standalone chart library items (no dashboardId)' })
  findLibrary(@CurrentUser() user: User) {
    return this.vizsService.findLibrary(user.tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all visualizations for a dashboard' })
  findByDashboard(
    @CurrentUser() user: User,
    @Query('dashboardId', ParseUUIDPipe) dashboardId: string,
  ) {
    return this.vizsService.findByDashboard(dashboardId, user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get visualization by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.vizsService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Update visualization config' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisualizationDto,
    @CurrentUser() user: User,
  ) {
    return this.vizsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a visualization' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.vizsService.delete(id, user.tenantId);
  }
}
