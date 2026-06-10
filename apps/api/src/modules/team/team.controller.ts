import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.EDITOR)
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('members')
  @ApiOperation({ summary: "List the current user's team members" })
  getMembers(@CurrentUser() user: User) {
    return this.teamService.getMembers(user.id, user.tenantId);
  }

  @Get('available')
  @ApiOperation({ summary: 'List users that can be added to the team' })
  getAvailable(@CurrentUser() user: User) {
    return this.teamService.getAvailableUsers(user.id, user.tenantId);
  }

  @Post('members')
  @ApiOperation({ summary: 'Add a user to the team' })
  addMember(@Body() body: { userId: string }, @CurrentUser() user: User) {
    return this.teamService.addMember(user.id, body.userId, user.tenantId);
  }

  @Delete('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a user from the team' })
  removeMember(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.teamService.removeMember(user.id, memberId, user.tenantId);
  }
}
