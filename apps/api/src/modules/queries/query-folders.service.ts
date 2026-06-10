import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryFolder, QueryVisibility, User, TeamMember } from '../../database/entities';
import { CreateQueryFolderDto, UpdateQueryFolderDto } from './dto/query-folder.dto';

@Injectable()
export class QueryFoldersService {
  constructor(
    @InjectRepository(QueryFolder) private folderRepo: Repository<QueryFolder>,
    @InjectRepository(TeamMember) private teamMemberRepo: Repository<TeamMember>,
  ) {}

  async create(user: User, dto: CreateQueryFolderDto): Promise<QueryFolder> {
    if (dto.parentId) {
      const parent = await this.folderRepo.findOne({
        where: { id: dto.parentId, tenantId: user.tenantId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
      // Prevent circular nesting beyond a reasonable depth
      await this.assertNestingDepth(dto.parentId, user.tenantId);
    }
    const folder = this.folderRepo.create({
      tenantId: user.tenantId,
      createdById: user.id,
      name: dto.name,
      parentId: dto.parentId ?? undefined,
      visibility: dto.visibility ?? QueryVisibility.PRIVATE,
    });
    return this.folderRepo.save(folder);
  }

  async findAll(user: User): Promise<QueryFolder[]> {
    const qb = this.folderRepo.createQueryBuilder('f')
      .leftJoinAndSelect('f.createdBy', 'createdBy')
      .leftJoin(
        'team_members',
        'tm',
        'tm.owner_id = f.created_by_id AND tm.member_id = :userId',
        { userId: user.id },
      )
      .where('f.tenant_id = :tenantId', { tenantId: user.tenantId });

    if (user.role !== 'admin') {
      qb.andWhere(
        `(
          (f.visibility = :priv AND f.created_by_id = :userId)
          OR (f.visibility = :team AND (f.created_by_id = :userId OR tm.member_id IS NOT NULL))
          OR (f.visibility = :editors AND :role IN ('admin', 'editor'))
        )`,
        {
          priv: QueryVisibility.PRIVATE,
          team: QueryVisibility.TEAM,
          editors: QueryVisibility.EDITORS,
          userId: user.id,
          role: user.role,
        },
      );
    }

    return qb.orderBy('f.name', 'ASC').getMany();
  }

  async update(id: string, user: User, dto: UpdateQueryFolderDto): Promise<QueryFolder> {
    const folder = await this.findOwned(id, user);
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) throw new BadRequestException('A folder cannot be its own parent');
      if (dto.parentId) {
        const parent = await this.folderRepo.findOne({
          where: { id: dto.parentId, tenantId: user.tenantId },
        });
        if (!parent) throw new NotFoundException('Parent folder not found');
        await this.assertNestingDepth(dto.parentId, user.tenantId);
      }
      folder.parentId = dto.parentId ?? undefined;
    }
    if (dto.name !== undefined) folder.name = dto.name;
    if (dto.visibility !== undefined) folder.visibility = dto.visibility;
    return this.folderRepo.save(folder);
  }

  async delete(id: string, user: User): Promise<void> {
    const folder = await this.findOwned(id, user);
    // Queries with this folderId will have folder_id set to NULL via ON DELETE SET NULL
    await this.folderRepo.remove(folder);
  }

  // Only the creator (or admin) can mutate a folder
  private async findOwned(id: string, user: User): Promise<QueryFolder> {
    const folder = await this.folderRepo.findOne({
      where: { id, tenantId: user.tenantId },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    if (user.role !== 'admin' && folder.createdById !== user.id) {
      throw new ForbiddenException('You do not own this folder');
    }
    return folder;
  }

  private async assertNestingDepth(parentId: string, tenantId: string, depth = 0): Promise<void> {
    if (depth >= 4) throw new BadRequestException('Maximum folder nesting depth (5) exceeded');
    const parent = await this.folderRepo.findOne({ where: { id: parentId, tenantId } });
    if (parent?.parentId) {
      await this.assertNestingDepth(parent.parentId, tenantId, depth + 1);
    }
  }
}
