import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';
import { AiService } from './ai.service';
import type { AiProvider, PromptFeature } from '../../database/entities';

function assertAiEnabled(user: User) {
  if (user.role !== UserRole.ADMIN && user.aiEnabled === false) {
    throw new ForbiddenException('AI features are disabled for your account. Contact your administrator.');
  }
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check AI configuration status' })
  getStatus(@CurrentUser() user: User) {
    return this.aiService.getConfigStatus(user.tenantId);
  }

  @Get('keys')
  @ApiOperation({ summary: 'List BYOK API keys for this tenant' })
  listKeys(@CurrentUser() user: User) {
    return this.aiService.listApiKeys(user.tenantId);
  }

  @Post('keys')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add or update a BYOK API key' })
  upsertKey(
    @CurrentUser() user: User,
    @Body() body: { provider: AiProvider; apiKey: string; model?: string },
  ) {
    return this.aiService.upsertApiKey(user.tenantId, body.provider, body.apiKey, body.model);
  }

  @Delete('keys/:provider')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a BYOK API key' })
  deleteKey(
    @Param('provider') provider: AiProvider,
    @CurrentUser() user: User,
  ) {
    return this.aiService.deleteApiKey(user.tenantId, provider);
  }

  @Post('nl-to-sql')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert natural language to SQL' })
  nlToSql(
    @CurrentUser() user: User,
    @Body() body: { prompt: string; datasourceId: string; schemaContext?: string },
  ) {
    assertAiEnabled(user);
    return this.aiService.nlToSql(user.tenantId, body.prompt, body.datasourceId, body.schemaContext, user.id);
  }

  @Post('generate-report')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a BI report for a saved query' })
  generateReport(@CurrentUser() user: User, @Body() body: { queryId: string }) {
    assertAiEnabled(user);
    return this.aiService.generateReport(user.tenantId, body.queryId);
  }

  @Post('chat')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chat with the AI analytics assistant' })
  chat(
    @CurrentUser() user: User,
    @Body() body: { messages: { role: string; content: string }[]; datasourceId?: string; schemaFilter?: string },
  ) {
    assertAiEnabled(user);
    return this.aiService.chat(user.tenantId, body.messages, body.datasourceId, body.schemaFilter);
  }

  @Post('recommend-chart')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recommend chart type for a dataset' })
  recommendChart(
    @CurrentUser() user: User,
    @Body() body: { columns: string[]; sampleRows: Record<string, unknown>[] },
  ) {
    assertAiEnabled(user);
    return this.aiService.recommendChartType(body.columns, body.sampleRows);
  }

  @Post('optimize-query')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyse a SQL query and return optimization suggestions' })
  optimizeQuery(
    @CurrentUser() user: User,
    @Body() body: { sql: string; datasourceId: string },
  ) {
    assertAiEnabled(user);
    return this.aiService.optimizeQuery(user.tenantId, body.sql, body.datasourceId, user.id);
  }

  @Get('admin/usage')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get AI token usage statistics (admin only)' })
  getUsage(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.aiService.getUsageStats(user.tenantId, days ? parseInt(days, 10) : 30);
  }

  @Post('summarize-dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate an AI summary of a dashboard' })
  summarizeDashboard(
    @CurrentUser() user: User,
    @Body() body: { dashboardId: string },
  ) {
    assertAiEnabled(user);
    return this.aiService.summarizeDashboard(body.dashboardId, user.tenantId, user.id);
  }

  @Post('save-dashboard-summary')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Persist an AI dashboard summary to the dashboard record' })
  saveDashboardSummary(
    @CurrentUser() user: User,
    @Body() body: { dashboardId: string; summary: string; insights: string[]; anomalies: string[] },
  ) {
    return this.aiService.saveDashboardSummary(body.dashboardId, user.tenantId, {
      summary: body.summary,
      insights: body.insights,
      anomalies: body.anomalies,
    });
  }

  @Post('generate-alert-rule')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a draft alert rule from a natural language description' })
  generateAlertRule(
    @CurrentUser() user: User,
    @Body() body: { description: string; datasourceId?: string },
  ) {
    assertAiEnabled(user);
    return this.aiService.generateAlertRule(body.description, user.tenantId, body.datasourceId);
  }

  @Get('prompt-templates')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all custom AI prompt templates for this tenant' })
  listPromptTemplates(@CurrentUser() user: User) {
    return this.aiService.listPromptTemplates(user.tenantId);
  }

  @Put('prompt-templates/:feature')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create or update a custom AI prompt template' })
  upsertPromptTemplate(
    @CurrentUser() user: User,
    @Param('feature') feature: PromptFeature,
    @Body() body: { template: string },
  ) {
    return this.aiService.upsertPromptTemplate(user.tenantId, feature, body.template);
  }

  @Delete('prompt-templates/:feature')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom prompt template (reverts to default)' })
  deletePromptTemplate(
    @CurrentUser() user: User,
    @Param('feature') feature: PromptFeature,
  ) {
    return this.aiService.deletePromptTemplate(user.tenantId, feature);
  }
}
