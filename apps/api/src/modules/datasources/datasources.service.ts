import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as path from 'path';
import { Datasource, DatasourceStatus, DatasourceType, DatasourceVisibility, User, UserRole } from '../../database/entities';
import { CreateDatasourceDto, UpdateDatasourceDto } from './dto/datasource.dto';
import { createConnector } from './connectors/connector.factory';

function parseCsvBuffer(buffer: Buffer): { columns: { name: string; type: string }[]; rows: Record<string, unknown>[] } {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]!);
  const columns = headers.map((h) => ({ name: h || `col_${headers.indexOf(h)}`, type: 'text' }));
  const rows = lines.slice(1).map((line) => {
    const vals = parseRow(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? null; });
    return row;
  });
  return { columns, rows };
}

function parseXlsxBuffer(buffer: Buffer, filename: string): { columns: { name: string; type: string }[]; rows: Record<string, unknown>[] } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestException(`No sheets found in ${filename}`);
  const sheet = workbook.Sheets[sheetName]!;
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  if (jsonRows.length === 0) return { columns: [], rows: [] };
  const headers = Object.keys(jsonRows[0]!);
  const columns = headers.map((h) => ({ name: String(h), type: 'text' }));
  const rows = jsonRows.map((r: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {};
    headers.forEach((h) => { mapped[h] = r[h] ?? null; });
    return mapped;
  });
  return { columns, rows };
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'prismalytics-default-enc-key-32byt';
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0] ?? '', 'hex');
  const tag = Buffer.from(parts[1] ?? '', 'hex');
  const dataHex = parts[2] ?? '';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

@Injectable()
export class DatasourcesService {
  private readonly logger = new Logger(DatasourcesService.name);

  constructor(
    @InjectRepository(Datasource) private datasourceRepo: Repository<Datasource>,
  ) {}

  async create(tenantId: string, user: User, dto: CreateDatasourceDto) {
    const { config } = dto;
    const password = config.password;
    const safeConfig = { ...config };
    delete (safeConfig as Record<string, unknown>)['password'];

    const datasource = this.datasourceRepo.create({
      tenantId,
      createdById: user.id,
      name: dto.name,
      description: dto.description,
      type: dto.type,
      visibility: dto.visibility ?? DatasourceVisibility.PRIVATE,
      config: safeConfig,
      encryptedPassword: password ? encrypt(password) : undefined,
    });

    return this.datasourceRepo.save(datasource);
  }

  async findAll(tenantId: string, user: User) {
    const isAdmin = user.role === UserRole.ADMIN;
    if (isAdmin) {
      return this.datasourceRepo.find({
        where: { tenantId },
        order: { createdAt: 'DESC' },
        relations: ['createdBy'],
      });
    }
    // Editors: own datasources (any visibility) + shared datasources owned by others
    const all = await this.datasourceRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      relations: ['createdBy'],
    });
    return all
      .filter((ds) => ds.createdById === user.id || ds.visibility === DatasourceVisibility.SHARED)
      .map((ds) => this.sanitizeForNonOwner(ds, user.id));
  }

  async findOne(id: string, tenantId: string, user: User) {
    const ds = await this.datasourceRepo.findOne({
      where: { id, tenantId },
      relations: ['createdBy'],
    });
    if (!ds) throw new NotFoundException('Datasource not found');
    const isAdmin = user.role === UserRole.ADMIN;
    const isOwner = ds.createdById === user.id;
    if (!isAdmin && !isOwner && ds.visibility === DatasourceVisibility.PRIVATE) {
      throw new ForbiddenException('You do not have access to this datasource');
    }
    return this.sanitizeForNonOwner(ds, user.id);
  }

  private sanitizeForNonOwner(ds: Datasource, userId: string): Datasource {
    if (ds.createdById === userId) return ds;
    ds.config = {} as Datasource['config'];
    return ds;
  }

  async update(id: string, tenantId: string, user: User, dto: UpdateDatasourceDto) {
    const ds = await this.datasourceRepo.findOne({ where: { id, tenantId } });
    if (!ds) throw new NotFoundException('Datasource not found');
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isAdmin && ds.createdById !== user.id) {
      throw new ForbiddenException('Only the datasource creator can edit it');
    }
    if (dto.name) ds.name = dto.name;
    if (dto.description !== undefined) ds.description = dto.description;
    if (dto.visibility !== undefined) ds.visibility = dto.visibility;
    if (dto.config) {
      const password = (dto.config as Record<string, unknown>)['password'] as string | undefined;
      const safeConfig = { ...dto.config };
      delete (safeConfig as Record<string, unknown>)['password'];
      ds.config = { ...ds.config, ...safeConfig };
      if (password) ds.encryptedPassword = encrypt(password);
    }
    return this.datasourceRepo.save(ds);
  }

  async delete(id: string, tenantId: string, user: User) {
    const ds = await this.datasourceRepo.findOne({ where: { id, tenantId } });
    if (!ds) throw new NotFoundException('Datasource not found');
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isAdmin && ds.createdById !== user.id) {
      throw new ForbiddenException('Only the datasource creator can delete it');
    }
    await this.datasourceRepo.remove(ds);
  }

  async testConnection(id: string, tenantId: string, user: User) {
    const ds = await this.datasourceRepo.findOne({
      where: { id, tenantId },
      select: { id: true, type: true, config: true, encryptedPassword: true, createdById: true, visibility: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isAdmin && ds.createdById !== user.id) {
      throw new ForbiddenException('Only the datasource creator can test its connection');
    }

    const password = ds.encryptedPassword ? decrypt(ds.encryptedPassword) : '';
    let connector;
    try {
      connector = createConnector(ds, password);
      const result = await connector.test();

      await this.datasourceRepo.update(id, {
        status: result.success ? DatasourceStatus.ACTIVE : DatasourceStatus.ERROR,
        lastTestedAt: new Date(),
        lastErrorMessage: result.success ? undefined : result.message,
      });

      return result;
    } catch (err) {
      await this.datasourceRepo.update(id, {
        status: DatasourceStatus.ERROR,
        lastTestedAt: new Date(),
        lastErrorMessage: (err as Error).message,
      });
      throw new BadRequestException(`Connection failed: ${(err as Error).message}`);
    } finally {
      if (connector) await connector.close().catch(() => {});
    }
  }

  async getCollections(id: string, tenantId: string, database: string, user: User) {
    const ds = await this.datasourceRepo.findOne({
      where: { id, tenantId },
      select: { id: true, type: true, config: true, encryptedPassword: true, createdById: true, visibility: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isAdmin && ds.createdById !== user.id && ds.visibility === DatasourceVisibility.PRIVATE) {
      throw new ForbiddenException('You do not have access to this datasource');
    }

    const password = ds.encryptedPassword ? decrypt(ds.encryptedPassword) : '';
    const connector = createConnector(ds, password);
    try {
      return await connector.getCollections(database);
    } finally {
      await connector.close().catch(() => {});
    }
  }

  async getDatabases(id: string, tenantId: string, user: User) {
    const ds = await this.datasourceRepo.findOne({
      where: { id, tenantId },
      select: { id: true, type: true, config: true, encryptedPassword: true, createdById: true, visibility: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isAdmin && ds.createdById !== user.id && ds.visibility === DatasourceVisibility.PRIVATE) {
      throw new ForbiddenException('You do not have access to this datasource');
    }

    const password = ds.encryptedPassword ? decrypt(ds.encryptedPassword) : '';
    const connector = createConnector(ds, password);
    try {
      return await connector.getDatabases();
    } finally {
      await connector.close().catch(() => {});
    }
  }

  async getSchema(id: string, tenantId: string, user: User, schema?: string) {
    const ds = await this.datasourceRepo.findOne({
      where: { id, tenantId },
      select: { id: true, type: true, config: true, encryptedPassword: true, createdById: true, visibility: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isAdmin && ds.createdById !== user.id && ds.visibility === DatasourceVisibility.PRIVATE) {
      throw new ForbiddenException('You do not have access to this datasource');
    }

    const password = ds.encryptedPassword ? decrypt(ds.encryptedPassword) : '';
    const connector = createConnector(ds, password);
    try {
      return await connector.getSchema(schema);
    } finally {
      await connector.close().catch(() => {});
    }
  }

  async uploadFile(
    tenantId: string,
    user: User,
    file: { originalname: string; mimetype: string; buffer: Buffer },
    visibility = DatasourceVisibility.PRIVATE,
  ) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isCsv = ext === '.csv' || file.mimetype === 'text/csv';
    const isExcel =
      ext === '.xlsx' ||
      ext === '.xls' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';

    if (!isCsv && !isExcel) {
      throw new BadRequestException('Only CSV and Excel files (.csv, .xlsx, .xls) are supported');
    }

    const parsed = isCsv
      ? parseCsvBuffer(file.buffer)
      : parseXlsxBuffer(file.buffer, file.originalname);

    if (parsed.columns.length === 0) {
      throw new BadRequestException('File has no columns or is empty');
    }

    const ds = this.datasourceRepo.create({
      tenantId,
      createdById: user.id,
      name: file.originalname,
      description: `Uploaded ${isCsv ? 'CSV' : 'Excel'} file`,
      type: DatasourceType.CSV,
      status: DatasourceStatus.ACTIVE,
      visibility,
      config: {
        csvRows: parsed.rows,
        csvColumns: parsed.columns,
        csvFilename: file.originalname,
      },
    });

    return this.datasourceRepo.save(ds);
  }

  getDecryptedPassword(ds: Datasource): string {
    return ds.encryptedPassword ? decrypt(ds.encryptedPassword) : '';
  }
}
