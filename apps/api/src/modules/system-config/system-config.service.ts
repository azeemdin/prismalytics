import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from '../../database/entities';

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SystemConfig) private readonly repo: Repository<SystemConfig>,
  ) {}

  async get(key: string): Promise<string | null> {
    const record = await this.repo.findOne({ where: { key } });
    return record?.value ?? null;
  }

  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const map: Record<string, string | null> = {};
    for (const k of keys) map[k] = null;
    if (keys.length === 0) return map;
    const records = await this.repo.find({ where: keys.map((key) => ({ key })) });
    for (const r of records) map[r.key] = r.value;
    return map;
  }

  async getAll(): Promise<Record<string, string | null>> {
    const records = await this.repo.find({ order: { key: 'ASC' } });
    const map: Record<string, string | null> = {};
    for (const r of records) map[r.key] = r.value;
    return map;
  }

  async set(key: string, value: string | null): Promise<void> {
    const existing = await this.repo.findOne({ where: { key } });
    if (existing) {
      existing.value = value;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ key, value }));
    }
  }

  async setMany(entries: Record<string, string | null>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }
}
