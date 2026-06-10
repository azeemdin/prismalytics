import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config'; // still needed for REDIS_HOST/PORT
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { AlertRule } from '../../database/entities/alert-rule.entity';
import { AlertEvaluation } from '../../database/entities/alert-evaluation.entity';
import { AlertNotification } from '../../database/entities/alert-notification.entity';
import { Datasource } from '../../database/entities/datasource.entity';
import { DatasourcesService } from '../datasources/datasources.service';
import { createConnector } from '../datasources/connectors/connector.factory';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';

const QUEUE_NAME = 'alerts';

interface AlertJobPayload {
  ruleId: string;
}

function evaluateCondition(value: number, condition: string, threshold: number): boolean {
  switch (condition) {
    case 'gt':  return value > threshold;
    case 'lt':  return value < threshold;
    case 'eq':  return value === threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    default:    return false;
  }
}

function conditionLabel(condition: string, threshold: number): string {
  const opMap: Record<string, string> = { gt: '>', lt: '<', eq: '=', gte: '>=', lte: '<=' };
  return `${opMap[condition] ?? condition} ${threshold}`;
}

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name);
  private queue: Queue;
  private worker: Worker;
  private connection: IORedis;

  constructor(
    @InjectRepository(AlertRule) private ruleRepo: Repository<AlertRule>,
    @InjectRepository(AlertEvaluation) private evalRepo: Repository<AlertEvaluation>,
    @InjectRepository(AlertNotification) private notifRepo: Repository<AlertNotification>,
    @InjectRepository(Datasource) private datasourceRepo: Repository<Datasource>,
    private readonly datasourcesService: DatasourcesService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const redisHost = this.config.get<string>('REDIS_HOST');
    if (!redisHost) {
      this.logger.warn('REDIS_HOST not configured alerts queue disabled');
      return;
    }

    this.connection = new IORedis({
      host: redisHost,
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<AlertJobPayload>) => {
        await this.evaluate(job.data.ruleId);
      },
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Alert job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Alerts queue initialized');
    this.restoreJobs().catch((err) => this.logger.error('Failed to restore alert jobs', err));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  private async restoreJobs(): Promise<void> {
    const rules = await this.ruleRepo.find({ where: { isActive: true } });
    for (const rule of rules) {
      await this.addJobToQueue(rule);
    }
    this.logger.log(`Restored ${rules.length} active alert rules`);
  }

  private async addJobToQueue(rule: AlertRule): Promise<void> {
    if (!this.queue) return;
    const jobId = `alert-${rule.id}`;
    await this.queue.add(
      'evaluate-alert',
      { ruleId: rule.id } satisfies AlertJobPayload,
      {
        jobId,
        repeat: { pattern: rule.schedule },
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );
  }

  private async removeJobFromQueue(ruleId: string, schedule: string): Promise<void> {
    if (!this.queue) return;
    const jobId = `alert-${ruleId}`;
    await this.queue
      .removeRepeatableByKey(`${QUEUE_NAME}:${jobId}:::${schedule}`)
      .catch(() => {});
  }

  // â”€â”€â”€ CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async findAll(tenantId: string, page = 1, limit = 20) {
    const [rules, total] = await this.ruleRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { rules, total, page, limit };
  }

  async findOne(id: string, tenantId: string): Promise<AlertRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException('Alert rule not found');
    return rule;
  }

  async create(tenantId: string, dto: CreateAlertDto): Promise<AlertRule> {
    const rule = this.ruleRepo.create({
      tenantId,
      name: dto.name,
      datasourceId: dto.datasourceId,
      sql: dto.sql,
      condition: dto.condition,
      threshold: dto.threshold,
      columnName: dto.columnName,
      schedule: dto.schedule,
      channels: (dto.channels ?? []) as Array<{ type: 'email' | 'slack' | 'webhook'; target: string }>,
      // Always start inactive admin must explicitly activate
      isActive: false,
      notificationsEnabled: false,
    });
    return this.ruleRepo.save(rule) as Promise<AlertRule>;
  }

  async update(id: string, tenantId: string, dto: UpdateAlertDto): Promise<AlertRule> {
    const rule = await this.findOne(id, tenantId);
    const oldSchedule = rule.schedule;
    const wasActive = rule.isActive;
    Object.assign(rule, dto);
    // update() cannot change isActive use activate/deactivate endpoints
    rule.isActive = wasActive;
    const saved = await this.ruleRepo.save(rule);

    if (wasActive) {
      await this.removeJobFromQueue(id, oldSchedule);
      await this.addJobToQueue(saved);
    }
    return saved;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const rule = await this.findOne(id, tenantId);
    await this.removeJobFromQueue(id, rule.schedule);
    await this.ruleRepo.remove(rule);
  }

  // â”€â”€â”€ Activate / Deactivate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async activateRule(id: string, tenantId: string): Promise<AlertRule> {
    const rule = await this.findOne(id, tenantId);
    if (rule.isActive) return rule;
    rule.isActive = true;
    const saved = await this.ruleRepo.save(rule);
    await this.addJobToQueue(saved);
    this.logger.log(`Alert rule ${id} activated by admin`);
    return saved;
  }

  async deactivateRule(id: string, tenantId: string): Promise<AlertRule> {
    const rule = await this.findOne(id, tenantId);
    if (!rule.isActive) return rule;
    rule.isActive = false;
    const saved = await this.ruleRepo.save(rule);
    await this.removeJobFromQueue(id, rule.schedule);
    this.logger.log(`Alert rule ${id} deactivated by admin`);
    return saved;
  }

  // â”€â”€â”€ Evaluation Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async evaluate(ruleId: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule || !rule.isActive) return;

    const previousStatus = rule.lastStatus;
    const evaluatedAt = new Date();

    let value: number | undefined;
    let status = 'error';
    let errorMsg: string | undefined;
    let evaluationId: string | undefined;

    try {
      const ds = await this.datasourceRepo.findOne({
        where: { id: rule.datasourceId },
        select: { id: true, type: true, config: true, encryptedPassword: true },
      });
      if (!ds) throw new Error(`Datasource ${rule.datasourceId} not found`);

      const password = this.datasourcesService.getDecryptedPassword(ds);
      const connector = createConnector(ds, password);
      let result: { rows: Record<string, unknown>[]; rowCount: number; durationMs: number };
      try {
        result = await connector.query(rule.sql, []);
      } finally {
        await connector.close().catch(() => {});
      }

      const firstRow = result.rows[0];
      if (!firstRow) throw new Error('Query returned no rows');

      // Case-insensitive lookup Oracle returns uppercase column names by default
      const colKey = Object.keys(firstRow).find(
        (k) => k.toLowerCase() === rule.columnName.toLowerCase(),
      );
      const rawValue = colKey !== undefined ? firstRow[colKey] : undefined;
      if (rawValue === undefined || rawValue === null) {
        const available = Object.keys(firstRow).join(', ');
        throw new Error(
          `Column "${rule.columnName}" not found in result. Available columns: ${available}`,
        );
      }
      value = parseFloat(String(rawValue));
      if (isNaN(value)) throw new Error(`Column "${rule.columnName}" value is not numeric: ${rawValue}`);

      const firing = evaluateCondition(value, rule.condition, rule.threshold);
      status = firing ? 'firing' : 'ok';
    } catch (err) {
      status = 'error';
      errorMsg = (err as Error).message;
      this.logger.error(`Alert ${ruleId} evaluation error: ${errorMsg}`);
    }

    rule.lastEvaluatedAt = evaluatedAt;
    rule.lastStatus = status;
    await this.ruleRepo.save(rule);

    const evaluation = this.evalRepo.create({
      alertRuleId: rule.id,
      tenantId: rule.tenantId,
      evaluatedAt,
      value,
      status,
      error: errorMsg,
    });
    const savedEval = await this.evalRepo.save(evaluation);
    evaluationId = savedEval.id;

    // When transitioning to FIRING and notifications are enabled, split channels
    // into auto-approve (sent immediately) and manual (pending admin confirmation).
    if (status === 'firing' && previousStatus !== 'firing' && rule.notificationsEnabled) {
      const message = `Alert "${rule.name}" is FIRING. Detected value ${value} ${conditionLabel(rule.condition, rule.threshold)}.`;
      const autoChannels  = rule.channels.filter((c) => c.autoApprove === true);
      const manualChannels = rule.channels.filter((c) => c.autoApprove !== true);

      if (autoChannels.length > 0) {
        const autoNotif = await this.notifRepo.save(
          this.notifRepo.create({
            alertRuleId: rule.id,
            alertEvaluationId: evaluationId,
            tenantId: rule.tenantId,
            name: rule.name,
            channels: autoChannels,
            detectedValue: value,
            threshold: rule.threshold,
            condition: rule.condition,
            message,
            status: 'sent',
            sentAt: new Date(),
          }),
        );
        await this.dispatchNotification(autoNotif);
        this.logger.log(`Auto-approved notification dispatched for alert "${rule.name}" (${autoChannels.length} channel(s))`);
      }

      if (manualChannels.length > 0) {
        await this.notifRepo.save(
          this.notifRepo.create({
            alertRuleId: rule.id,
            alertEvaluationId: evaluationId,
            tenantId: rule.tenantId,
            name: rule.name,
            channels: manualChannels,
            detectedValue: value,
            threshold: rule.threshold,
            condition: rule.condition,
            message,
            status: 'pending',
          }),
        );
        this.logger.log(`Pending notification created for alert "${rule.name}" admin confirmation required`);
      }
    }
  }

  async getEvaluations(ruleId: string, tenantId: string, page = 1, limit = 20) {
    await this.findOne(ruleId, tenantId);
    const [evaluations, total] = await this.evalRepo.findAndCount({
      where: { alertRuleId: ruleId },
      order: { evaluatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { evaluations, total, page, limit };
  }

  // â”€â”€â”€ Notifications (admin-confirmed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async findPendingNotifications(tenantId: string, page = 1, limit = 50) {
    const [notifications, total] = await this.notifRepo.findAndCount({
      where: { tenantId, status: 'pending' },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { notifications, total, page, limit };
  }

  async confirmNotification(notificationId: string, tenantId: string, adminUserId: string): Promise<AlertNotification> {
    const notif = await this.notifRepo.findOne({ where: { id: notificationId, tenantId } });
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.status !== 'pending') {
      throw new BadRequestException(`Notification is already ${notif.status}`);
    }

    // Send to all channels failures are logged but do not abort the whole operation
    await this.dispatchNotification(notif);

    notif.status = 'sent';
    notif.sentAt = new Date();
    notif.sentById = adminUserId;
    return this.notifRepo.save(notif);
  }

  async dismissNotification(notificationId: string, tenantId: string): Promise<AlertNotification> {
    const notif = await this.notifRepo.findOne({ where: { id: notificationId, tenantId } });
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.status !== 'pending') {
      throw new BadRequestException(`Notification is already ${notif.status}`);
    }
    notif.status = 'dismissed';
    return this.notifRepo.save(notif);
  }

  private async dispatchNotification(notif: AlertNotification): Promise<void> {
    for (const channel of notif.channels) {
      try {
        if (channel.type === 'email') {
          await this.notifications.sendEmail({
            to: channel.target,
            subject: `[prismalytics Alert] "${notif.name}" is FIRING`,
            html: `
              <h2>Alert: ${notif.name}</h2>
              <p>${notif.message}</p>
              <table style="border-collapse:collapse;font-size:14px">
                <tr><td style="padding:4px 12px;font-weight:bold">Value</td><td style="padding:4px 12px">${notif.detectedValue}</td></tr>
                <tr><td style="padding:4px 12px;font-weight:bold">Condition</td><td style="padding:4px 12px">${conditionLabel(notif.condition, notif.threshold)}</td></tr>
                <tr><td style="padding:4px 12px;font-weight:bold">Detected at</td><td style="padding:4px 12px">${notif.createdAt.toISOString()}</td></tr>
              </table>
              <p style="color:#888;font-size:12px">This notification was manually confirmed by an administrator in prismalytics.</p>
            `,
          });
        } else if (channel.type === 'slack') {
          await fetch(channel.target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: notif.message }),
          });
        } else if (channel.type === 'webhook') {
          await fetch(channel.target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert: notif.name,
              value: notif.detectedValue,
              threshold: notif.threshold,
              condition: notif.condition,
              message: notif.message,
              status: 'firing',
              timestamp: notif.createdAt,
            }),
          });
        }
      } catch (err) {
        this.logger.error(`Failed to dispatch ${channel.type} for notification ${notif.id}: ${(err as Error).message}`);
      }
    }
  }

}
