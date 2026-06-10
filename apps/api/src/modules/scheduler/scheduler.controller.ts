import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';
import { SchedulerService } from './scheduler.service';
import { CreateScheduledJobDto, UpdateScheduledJobDto } from './dto/scheduled-job.dto';

@ApiTags('scheduler')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scheduler/jobs')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get()
  @ApiOperation({ summary: 'List scheduled jobs' })
  findAll(@CurrentUser() user: User) {
    return this.schedulerService.findAll(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a scheduled job' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.schedulerService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Create a scheduled job' })
  create(@CurrentUser() user: User, @Body() dto: CreateScheduledJobDto) {
    return this.schedulerService.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Update a scheduled job' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateScheduledJobDto,
  ) {
    return this.schedulerService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a scheduled job' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.schedulerService.delete(id, user.tenantId);
  }

  @Post(':id/run')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger a job immediately' })
  runNow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.schedulerService.runNow(id, user.tenantId);
  }
}
