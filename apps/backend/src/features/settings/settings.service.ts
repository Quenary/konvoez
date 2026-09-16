import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  defaultSettingValues,
  ESettingKey,
  settingValueSchemas,
  TSetting,
  TSettingByKey,
  TSettingValueMap,
} from '@konvoez/shared';
import { SettingsEntity } from './settings.entity';
import { SettingsUpdateDto } from './settings.dto';

@Injectable()
export class SettingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettingsService.name);
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(SettingsEntity)
    private readonly repo: EntityRepository<SettingsEntity>,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.initSettings();
  }

  private parseEnvValue(raw: string): unknown {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  async initSettings(): Promise<void> {
    const em = this.em.fork();
    const repo = em.getRepository(SettingsEntity);
    const keys = Object.values(ESettingKey);

    for (const key of keys) {
      const schema = settingValueSchemas[key];
      const defaultValue = defaultSettingValues[key];

      const envRaw = process.env[key] ?? process.env[`SETTINGS_${key}`];
      let valueToSave: TSetting['value'] = defaultValue;
      let shouldSaveEnvValue = false;

      if (envRaw !== undefined && envRaw !== '') {
        const parsed = this.parseEnvValue(envRaw);
        const result = schema.safeParse(parsed);
        if (result.success) {
          valueToSave = result.data as TSetting['value'];
          shouldSaveEnvValue = true;
          this.logger.log(`Loaded setting "${key}" from environment.`);
        } else {
          this.logger.warn(
            `Invalid environment value for setting "${key}": ${result.error.message}`,
          );
        }
      }

      const existing = await repo.findOne({ key });

      if (shouldSaveEnvValue) {
        if (existing) {
          repo.assign(existing, { value: valueToSave });
        } else {
          const setting = repo.create({
            key,
            value: valueToSave,
          });
          em.persist(setting);
        }
      } else if (existing) {
        const result = schema.safeParse(existing.value);
        if (!result.success) {
          this.logger.warn(
            `Setting "${key}" in database is invalid. Resetting to default value.`,
          );
          repo.assign(existing, { value: defaultValue });
        }
      } else {
        this.logger.log(
          `Setting "${key}" not found in database. Initializing with default value.`,
        );
        const setting = repo.create({
          key,
          value: defaultValue,
        });
        em.persist(setting);
      }
    }

    await em.flush();
  }

  toDto<K extends ESettingKey = ESettingKey>(
    setting: SettingsEntity,
  ): TSettingByKey<K> {
    return {
      key: setting.key,
      value: setting.value,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    } as unknown as TSettingByKey<K>;
  }

  async findOne(key: ESettingKey): Promise<SettingsEntity> {
    const setting = await this.repo.findOne({ key });
    if (!setting) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }
    return setting;
  }

  async findOneAsDto<K extends ESettingKey>(key: K): Promise<TSettingByKey<K>> {
    const setting = await this.findOne(key);
    return this.toDto<K>(setting);
  }

  async getValue<K extends ESettingKey>(key: K): Promise<TSettingValueMap[K]> {
    const setting = await this.findOne(key);
    return setting.value as TSettingValueMap[K];
  }

  async findAll(): Promise<SettingsEntity[]> {
    return this.repo.findAll();
  }

  async findAllAsDto(): Promise<TSetting[]> {
    const settings = await this.findAll();
    return settings.map((setting) => this.toDto(setting));
  }

  async update(
    key: ESettingKey,
    dto: SettingsUpdateDto,
  ): Promise<SettingsEntity> {
    const schema = settingValueSchemas[key];
    if (!schema) {
      throw new NotFoundException(`Setting with key "${key}" not supported`);
    }

    const result = schema.safeParse(dto.value);
    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }

    const setting = await this.findOne(key);
    this.repo.assign(setting, { value: result.data });
    this.em.persist(setting);
    await this.em.flush();
    return setting;
  }

  async updateAsDto<K extends ESettingKey>(
    key: K,
    dto: SettingsUpdateDto,
  ): Promise<TSettingByKey<K>> {
    const setting = await this.update(key, dto);
    return this.toDto<K>(setting);
  }
}
