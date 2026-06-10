import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { ScheduledJob, Datasource, User } from '../../database/entities';
import { DatasourcesService } from '../datasources/datasources.service';
import { createConnector } from '../datasources/connectors/connector.factory';
import { QueryResult } from '../datasources/connectors/connector.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { QueriesService } from '../queries/queries.service';
import { CreateScheduledJobDto, UpdateScheduledJobDto } from './dto/scheduled-job.dto';

const QUEUE_NAME = 'scheduled-query-jobs';

interface JobPayload {
  scheduledJobId: string;
  tenantId: string;
}

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private queue: Queue;
  private worker: Worker;
  private connection: IORedis;

  constructor(
    @InjectRepository(ScheduledJob) private jobRepo: Repository<ScheduledJob>,
    @InjectRepository(Datasource) private datasourceRepo: Repository<Datasource>,
    private readonly datasourcesService: DatasourcesService,
    private readonly notificationsService: NotificationsService,
    private readonly queriesService: QueriesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const redisHost = this.config.get<string>('REDIS_HOST');
    if (!redisHost) {
      this.logger.warn('REDIS_HOST not configured — scheduler queue disabled');
      return;
    }

    this.connection = new IORedis({
      host: redisHost,
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });

    this.worker = new Worker(QUEUE_NAME, async (job: Job<JobPayload>) => {
      await this.executeJob(job.data);
    }, { connection: this.connection });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Scheduler queue initialized');

    // Restore all enabled jobs from DB on startup
    this.restoreJobs().catch((err) => this.logger.error('Failed to restore jobs', err));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  private async restoreJobs(): Promise<void> {
    const jobs = await this.jobRepo.find({ where: { enabled: true } });
    for (const job of jobs) {
      await this.scheduleJob(job);
    }
    this.logger.log(`Restored ${jobs.length} scheduled jobs`);
  }

  private async scheduleJob(scheduledJob: ScheduledJob): Promise<void> {
    if (!this.queue) return;
    const jobId = `scheduled-${scheduledJob.id}`;
    // Remove existing repeatable job before re-adding
    await this.queue.removeRepeatableByKey(`${QUEUE_NAME}:${jobId}:::${scheduledJob.cronExpression}`).catch(() => {});

    await this.queue.add(
      jobId,
      { scheduledJobId: scheduledJob.id, tenantId: scheduledJob.tenantId } satisfies JobPayload,
      {
        jobId,
        repeat: { pattern: scheduledJob.cronExpression },
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );
  }

  private async removeJobFromQueue(scheduledJobId: string, cronExpression: string): Promise<void> {
    if (!this.queue) return;
    const jobId = `scheduled-${scheduledJobId}`;
    await this.queue.removeRepeatableByKey(`${QUEUE_NAME}:${jobId}:::${cronExpression}`).catch(() => {});
  }

  private async executeJob(payload: JobPayload): Promise<void> {
    const job = await this.jobRepo.findOne({
      where: { id: payload.scheduledJobId },
    });

    if (!job || !job.enabled) return;

    if (!job.queryId && !job.inlineSql) {
      this.logger.warn(`Job ${job.id} has no query or inline SQL configured`);
      return;
    }

    // Use a minimal system actor for query execution tracking
    const systemUser = { id: job.createdById } as User;

    try {
      let result: QueryResult & { truncated?: boolean };

      if (job.queryId) {
        // Delegate to QueriesService so targetCollection/targetDatabase and all
        // connector-specific logic (MongoDB pipeline wrapping, SQL validation, etc.)
        // are handled identically to interactive query execution.
        result = await this.queriesService.executeById(
          job.queryId,
          payload.tenantId,
          systemUser,
        );
      } else {
        // Inline SQL path — direct connector execution (SQL only, no MongoDB support)
        const datasourceId = job.datasourceId!;
        const ds = await this.datasourceRepo.findOne({
          where: { id: datasourceId, tenantId: payload.tenantId },
          select: { id: true, type: true, config: true, encryptedPassword: true },
        });
        if (!ds) throw new Error(`Datasource ${datasourceId} not found`);
        const password = this.datasourcesService.getDecryptedPassword(ds);
        const connector = createConnector(ds, password);
        try {
          result = await connector.query(job.inlineSql!, []);
        } finally {
          await connector.close().catch(() => {});
        }
      }

      job.lastRunAt = new Date();
      job.lastRunStatus = 'success';
      job.lastError = undefined;
      await this.jobRepo.save(job);

      if (job.recipients.length > 0) {
        const previewHtml = this.buildPreviewHtml(result.rows.slice(0, 20), Object.keys(result.rows[0] ?? {}));
        await this.notificationsService.sendQueryResultEmail({
          recipients: job.recipients,
          jobName: job.name,
          rowCount: result.rowCount,
          previewHtml,
        });
      }

      this.logger.log(`Job ${job.name} executed: ${result.rowCount} rows in ${result.durationMs}ms`);
    } catch (err) {
      job.lastRunAt = new Date();
      job.lastRunStatus = 'failure';
      job.lastError = (err as Error).message;
      await this.jobRepo.save(job);
      throw err;
    }
  }

  private buildPreviewHtml(rows: Record<string, unknown>[], columns: string[]): string {
    if (!rows.length) return '<p>No rows returned.</p>';
    const header = columns.map((c) => `<th style="padding:4px 8px;border:1px solid #ddd">${c}</th>`).join('');
    const body = rows.map((row) =>
      `<tr>${columns.map((c) => `<td style="padding:4px 8px;border:1px solid #ddd">${row[c] ?? ''}</td>`).join('')}</tr>`,
    ).join('');
    return `<table style="border-collapse:collapse;font-size:12px"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async findAll(tenantId: string) {
    return this.jobRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      relations: ['createdBy'],
    });
  }

  async findOne(id: string, tenantId: string) {
    const job = await this.jobRepo.findOne({ where: { id, tenantId }, relations: ['createdBy', 'query'] });
    if (!job) throw new NotFoundException('Scheduled job not found');
    return job;
  }

  async create(tenantId: string, userId: string, dto: CreateScheduledJobDto) {
    const job = this.jobRepo.create({
      tenantId,
      createdById: userId,
      ...dto,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.jobRepo.save(job);
    if (saved.enabled) await this.scheduleJob(saved);
    return saved;
  }

  async update(id: string, tenantId: string, dto: UpdateScheduledJobDto) {
    const job = await this.findOne(id, tenantId);
    const oldCron = job.cronExpression;
    Object.assign(job, dto);
    const saved = await this.jobRepo.save(job);

    // Re-schedule if cron or enabled changed
    await this.removeJobFromQueue(id, oldCron);
    if (saved.enabled) await this.scheduleJob(saved);

    return saved;
  }

  async delete(id: string, tenantId: string) {
    const job = await this.findOne(id, tenantId);
    await this.removeJobFromQueue(id, job.cronExpression);
    await this.jobRepo.remove(job);
  }

  async runNow(id: string, tenantId: string) {
    if (!this.queue) throw new Error('Scheduler queue unavailable — REDIS_HOST not configured');
    const job = await this.findOne(id, tenantId);
    await this.queue.add(
      `manual-${id}`,
      { scheduledJobId: id, tenantId } satisfies JobPayload,
      { removeOnComplete: true, removeOnFail: 10 },
    );
    return { queued: true };
  }
}
