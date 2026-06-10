import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ApiKey } from '../../database/entities';

@Injectable()
export class ApiKeysService {
  constructor(@InjectRepository(ApiKey) private repo: Repository<ApiKey>) {}

  async create(tenantId: string, userId: string, dto: { name: string; expiresInDays?: number }) {
    const rawKey = 'mk_' + crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 8);
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86_400_000)
      : undefined;
    const key = this.repo.create({ tenantId, userId, name: dto.name, keyHash, keyPrefix, expiresAt });
    const saved = await this.repo.save(key);
    return { ...saved, rawKey };
  }

  async findAll(tenantId: string, userId: string) {
    return this.repo.find({ where: { tenantId, userId }, order: { createdAt: 'DESC' } });
  }

  async findByRawKey(rawKey: string): Promise<ApiKey | null> {
    const now = new Date();
    const active = await this.repo.find({ where: { isActive: true }, take: 100 });
    for (const key of active) {
      if (key.expiresAt && key.expiresAt < now) continue;
      const match = await bcrypt.compare(rawKey, key.keyHash);
      if (match) {
        await this.repo.update(key.id, { lastUsedAt: now });
        return key;
      }
    }
    return null;
  }

  async revoke(id: string, tenantId: string, userId: string) {
    const key = await this.repo.findOne({ where: { id, tenantId, userId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.repo.update(id, { isActive: false });
  }

  async delete(id: string, tenantId: string, userId: string) {
    const key = await this.repo.findOne({ where: { id, tenantId, userId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.repo.delete(id);
  }
}
