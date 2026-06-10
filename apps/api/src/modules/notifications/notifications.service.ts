import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'prismalytics-default-enc-key-32byt';

export function encryptSmtpPassword(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSmtpPassword(encryptedData: string): string {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData; // not encrypted (legacy plain text)
    const iv = Buffer.from(parts[0] ?? '', 'hex');
    const tag = Buffer.from(parts[1] ?? '', 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return encryptedData;
  }
}

// Lazy import to avoid circular dependency SystemConfigService is injected optionally
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ISystemConfigService = { get(key: string): Promise<string | null> };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter;
  private systemConfig?: ISystemConfigService;

  constructor(private readonly config: ConfigService) {
    // Silent on startup SystemConfigModule.onModuleInit() calls reinitialize() once DB is ready
    this.transporter = this.buildTransporter(undefined, true);
  }

  // Called by NotificationsModule after construction to inject SystemConfigService without circular dep
  setSystemConfig(svc: ISystemConfigService) {
    this.systemConfig = svc;
  }

  private buildTransporter(override?: Partial<SmtpConfig>, silent = false): Transporter {
    const host = override?.host ?? this.config.get<string>('SMTP_HOST');
    if (!host) {
      if (!silent) this.logger.warn('SMTP not configured emails will be logged only');
      return nodemailer.createTransport({ jsonTransport: true });
    }
    return nodemailer.createTransport({
      host,
      port: override?.port ?? this.config.get<number>('SMTP_PORT') ?? 587,
      secure: override?.secure ?? this.config.get<boolean>('SMTP_SECURE') ?? false,
      auth: {
        user: override?.user ?? this.config.get<string>('SMTP_USER'),
        pass: override?.pass ?? this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  private async resolveSmtpConfig(): Promise<SmtpConfig> {
    if (this.systemConfig) {
      const [host, portStr, secureStr, user, encPass, from] = await Promise.all([
        this.systemConfig.get('smtp.host'),
        this.systemConfig.get('smtp.port'),
        this.systemConfig.get('smtp.secure'),
        this.systemConfig.get('smtp.user'),
        this.systemConfig.get('smtp.pass'),
        this.systemConfig.get('smtp.from'),
      ]);
      if (host) {
        return {
          host,
          port: portStr ? parseInt(portStr, 10) : (this.config.get<number>('SMTP_PORT') ?? 587),
          secure: secureStr === 'true',
          user: user ?? this.config.get<string>('SMTP_USER') ?? '',
          pass: encPass ? decryptSmtpPassword(encPass) : (this.config.get<string>('SMTP_PASS') ?? ''),
          from: from ?? this.config.get<string>('SMTP_FROM') ?? 'prismalytics <noreply@prismalytics.dev>',
        };
      }
    }
    return {
      host: this.config.get<string>('SMTP_HOST') ?? '',
      port: this.config.get<number>('SMTP_PORT') ?? 587,
      secure: this.config.get<boolean>('SMTP_SECURE') ?? false,
      user: this.config.get<string>('SMTP_USER') ?? '',
      pass: this.config.get<string>('SMTP_PASS') ?? '',
      from: this.config.get<string>('SMTP_FROM') ?? 'prismalytics <noreply@prismalytics.dev>',
    };
  }

  async reinitialize(): Promise<void> {
    const cfg = await this.resolveSmtpConfig();
    if (cfg.host) {
      this.transporter = this.buildTransporter(cfg);
      this.logger.log(`SMTP transporter reinitialized: ${cfg.host}:${cfg.port}`);
    } else {
      this.transporter = this.buildTransporter();
    }
  }

  async sendEmail(opts: SendEmailOptions): Promise<void> {
    const cfg = await this.resolveSmtpConfig();
    const from = cfg.from || this.config.get<string>('SMTP_FROM') || 'prismalytics <noreply@prismalytics.dev>';
    try {
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      this.logger.log(`Email sent: ${info.messageId}`);
    } catch (err) {
      this.logger.error(`Email send failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  async sendTestEmail(to: string): Promise<{ success: boolean; message: string }> {
    const cfg = await this.resolveSmtpConfig();
    if (!cfg.host) {
      return { success: false, message: 'SMTP host is not configured' };
    }
    const testTransporter = this.buildTransporter(cfg);
    try {
      await testTransporter.verify();
    } catch (err) {
      return { success: false, message: `SMTP connection failed: ${(err as Error).message}` };
    }
    try {
      await testTransporter.sendMail({
        from: cfg.from,
        to,
        subject: 'prismalytics SMTP test email',
        html: '<h2>SMTP is working</h2><p>This is a test email from your prismalytics instance.</p>',
        text: 'SMTP is working. This is a test email from your prismalytics instance.',
      });
      return { success: true, message: `Test email sent to ${to}` };
    } catch (err) {
      return { success: false, message: `Send failed: ${(err as Error).message}` };
    }
  }

  async sendQueryResultEmail(opts: {
    recipients: string[];
    jobName: string;
    rowCount: number;
    previewHtml: string;
  }): Promise<void> {
    await this.sendEmail({
      to: opts.recipients,
      subject: `[prismalytics] Scheduled report: ${opts.jobName}`,
      html: `
        <h2>Scheduled Report: ${opts.jobName}</h2>
        <p><strong>${opts.rowCount.toLocaleString()}</strong> rows returned.</p>
        <hr/>
        ${opts.previewHtml}
        <hr/>
        <p style="color:#888;font-size:12px">Sent by prismalytics automated scheduler</p>
      `,
    });
  }
}
