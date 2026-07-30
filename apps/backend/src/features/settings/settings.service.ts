import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { Injectable, NotFoundException } from '@nestjs/common';
import { SettingsEntity } from './settings.entity';
import { SettingsUpdateDto } from './settings.dto';

@Injectable()
export class SettingsService {
  private readonly em!: EntityManager;

  constructor(
    @InjectRepository(SettingsEntity)
    private readonly repo: EntityRepository<SettingsEntity>,
  ) {
    Object.assign(this, {
      em: this.repo.getEntityManager(),
    });
  }

  async findOne(
    by: Partial<Pick<SettingsEntity, 'id' | 'key'>>,
  ): Promise<SettingsEntity> {
    const setting = await this.repo.findOne(by);
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }
    return setting;
  }

  async findAll(): Promise<SettingsEntity[]> {
    return this.repo.findAll();
  }

  async update(id: number, dto: SettingsUpdateDto<any>) {
    const setting = await this.findOne({ id });
    this.repo.assign(setting, dto);
    this.em.persist(setting);
    await this.em.flush();
    return setting;
  }
}
