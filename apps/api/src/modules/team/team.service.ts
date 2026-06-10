import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamMember, User } from '../../database/entities';

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(TeamMember) private teamRepo: Repository<TeamMember>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async getMembers(ownerId: string, tenantId: string): Promise<TeamMember[]> {
    return this.teamRepo.find({
      where: { ownerId, tenantId },
      relations: ['member'],
      order: { createdAt: 'ASC' },
    });
  }

  async addMember(ownerId: string, memberId: string, tenantId: string): Promise<TeamMember> {
    if (ownerId === memberId) {
      throw new ConflictException('You cannot add yourself to your team');
    }
    const user = await this.userRepo.findOne({ where: { id: memberId, tenantId, isActive: true } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.teamRepo.findOne({ where: { ownerId, memberId } });
    if (existing) throw new ConflictException('User is already in your team');

    const entry = this.teamRepo.create({ ownerId, memberId, tenantId });
    return this.teamRepo.save(entry);
  }

  async removeMember(ownerId: string, memberId: string, tenantId: string): Promise<void> {
    await this.teamRepo.delete({ ownerId, memberId, tenantId });
  }

  // Returns all active users in the tenant that are NOT already in the owner's team
  async getAvailableUsers(ownerId: string, tenantId: string): Promise<User[]> {
    const members = await this.teamRepo.find({ where: { ownerId, tenantId } });
    const excludedIds = [ownerId, ...members.map((m) => m.memberId)];
    return this.userRepo
      .createQueryBuilder('u')
      .where('u.tenantId = :tenantId', { tenantId })
      .andWhere('u.isActive = true')
      .andWhere('u.id NOT IN (:...excluded)', { excluded: excludedIds })
      .orderBy('u.name', 'ASC')
      .getMany();
  }
}
