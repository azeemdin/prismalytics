import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, AuthProvider } from '../../database/entities';
import { UpdateUserDto, ChangePasswordDto, InviteUserDto } from './dto/user.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(tenantId: string, page = 1, limit = 20) {
    const [users, total] = await this.userRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { users, total, page, limit };
  }

  async findOne(id: string, tenantId: string) {
    const user = await this.userRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, tenantId: string, dto: UpdateUserDto, requestingUser: User) {
    const user = await this.findOne(id, tenantId);

    if (requestingUser.role !== UserRole.ADMIN && requestingUser.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    if (requestingUser.role !== UserRole.ADMIN && dto.role) {
      throw new ForbiddenException('Only admins can change roles');
    }

    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    void this.auditService.log({
      tenantId,
      userId: requestingUser.id,
      userName: requestingUser.name,
      action: 'update',
      resource: 'user',
      resourceId: user.id,
      resourceName: user.name,
      metadata: dto.role ? { role: dto.role } : undefined,
    });
    return saved;
  }

  async changePassword(id: string, tenantId: string, dto: ChangePasswordDto, requestingUser: User) {
    if (requestingUser.id !== id && requestingUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Cannot change another user\'s password');
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id AND u.tenantId = :tenantId', { id, tenantId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash ?? '');
    if (!valid) throw new BadRequestException('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepo.save(user);
    void this.auditService.log({
      tenantId,
      userId: requestingUser.id,
      userName: requestingUser.name,
      action: 'update',
      resource: 'user',
      resourceId: id,
      resourceName: user.name,
      metadata: { action: 'password_changed' },
    });
  }

  async deactivate(id: string, tenantId: string, requestingUser: User) {
    if (requestingUser.id === id) throw new ForbiddenException('Cannot deactivate yourself');
    const user = await this.findOne(id, tenantId);
    user.isActive = false;
    const saved = await this.userRepo.save(user);
    void this.auditService.log({
      tenantId,
      userId: requestingUser.id,
      userName: requestingUser.name,
      action: 'delete',
      resource: 'user',
      resourceId: user.id,
      resourceName: user.name,
      metadata: { action: 'deactivated' },
    });
    return saved;
  }

  async reactivate(id: string, tenantId: string) {
    const user = await this.findOne(id, tenantId);
    user.isActive = true;
    return this.userRepo.save(user);
  }

  async setAiEnabled(id: string, tenantId: string, enabled: boolean, requestingUser: User) {
    if (requestingUser.role !== UserRole.ADMIN) throw new ForbiddenException('Admin only');
    const user = await this.findOne(id, tenantId);
    user.aiEnabled = enabled;
    return this.userRepo.save(user);
  }

  async invite(tenantId: string, dto: InviteUserDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email, tenantId } });
    if (existing) throw new ConflictException('A user with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role,
      provider: AuthProvider.LOCAL,
      tenantId,
    });
    const saved = await this.userRepo.save(user);
    void this.auditService.log({
      tenantId,
      action: 'create',
      resource: 'user',
      resourceId: saved.id,
      resourceName: saved.name,
      metadata: { email: dto.email, role: dto.role },
    });
    return saved;
  }
}
