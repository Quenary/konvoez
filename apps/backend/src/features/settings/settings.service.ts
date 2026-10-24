import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import {
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  ApiErrorCode,
  defaultSettingValues,
  ESettingKey,
  settingValueSchemas,
  TSetting,
  TSettingByKey,
  TSettingItemUpdate,
  TSettingsUpdate,
  TSettingValueMap,
} from '@konvoez/shared';
import { SettingsEntity } from './settings.entity';
import { AppException } from '@shared/errors/app.exception';
import { ensureRequestContext } from '@shared/utils/request-context.util';

@Injectable()
export class SettingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettingsService.name);
  private readonly em!: EntityManager;
  private readonly envLockedKeys = new Set<ESettingKey>();

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
    await ensureRequestContext(this.em, async () => {
      this.envLockedKeys.clear();
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
            this.envLockedKeys.add(key);
            this.logger.log(`Loaded setting "${key}" from environment.`);
          } else {
            this.logger.warn(
              `Invalid environment value for setting "${key}": ${result.error.message}`,
            );
          }
        }

        const existing = await this.repo.findOne({ key });

        if (shouldSaveEnvValue) {
          if (existing) {
            this.repo.assign(existing, { value: valueToSave });
          } else {
            const setting = this.repo.create({
              key,
              value: valueToSave,
            });
            this.em.persist(setting);
          }
        } else if (existing) {
          const result = schema.safeParse(existing.value);
          if (!result.success) {
            this.logger.warn(
              `Setting "${key}" in database is invalid. Resetting to default value.`,
            );
            this.repo.assign(existing, { value: defaultValue });
          }
        } else {
          this.logger.log(
            `Setting "${key}" not found in database. Initializing with default value.`,
          );
          const setting = this.repo.create({
            key,
            value: defaultValue,
          });
          this.em.persist(setting);
        }
      }

      await this.em.flush();
    });
  }

  toDto<K extends ESettingKey = ESettingKey>(
    setting: SettingsEntity,
  ): TSettingByKey<K> {
    return {
      key: setting.key,
      value: setting.value,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
      envLocked: this.envLockedKeys.has(setting.key),
    } as unknown as TSettingByKey<K>;
  }

  async findOne(key: ESettingKey): Promise<SettingsEntity> {
    return ensureRequestContext(this.em, async () => {
      const setting = await this.repo.findOne({ key });
      if (!setting) {
        throw AppException.notFound(
          ApiErrorCode.SETTING_NOT_FOUND,
          `Setting with key "${key}" not found`,
        );
      }
      return setting;
    });
  }

  async findOneAsSafeDto<K extends ESettingKey>(
    key: K,
  ): Promise<TSettingByKey<K>> {
    const setting = await this.findOne(key);
    return this.toDto<K>(setting);
  }

  async getValue<K extends ESettingKey>(key: K): Promise<TSettingValueMap[K]> {
    const setting = await this.findOne(key);
    return setting.value as TSettingValueMap[K];
  }

  async findAll(): Promise<SettingsEntity[]> {
    return ensureRequestContext(this.em, () => this.repo.findAll());
  }

  async findAllAsSafeDto(): Promise<TSetting[]> {
    const settings = await this.findAll();
    return settings.map((setting) => this.toDto(setting));
  }

  async updateMany(dtos: TSettingsUpdate): Promise<SettingsEntity[]> {
    return ensureRequestContext(this.em, async () => {
      const updatedEntitiesMap = new Map<ESettingKey, SettingsEntity>();

      for (const item of dtos) {
        const { key, value } = item;
        if (this.envLockedKeys.has(key)) {
          throw new AppException(
            ApiErrorCode.SETTING_ENV_LOCKED,
            HttpStatus.CONFLICT,
            {
              message: `Setting "${key}" is set by environment`,
            },
          );
        }

        const schema = settingValueSchemas[key];
        if (!schema) {
          throw AppException.notFound(
            ApiErrorCode.SETTING_NOT_FOUND,
            `Setting with key "${key}" not supported`,
          );
        }

        const result = schema.safeParse(value);
        if (!result.success) {
          const fields = result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.message || issue.code,
          }));
          throw new AppException(
            ApiErrorCode.VALIDATION_FAILED,
            HttpStatus.BAD_REQUEST,
            {
              message: 'Validation failed',
              fields,
            },
          );
        }

        const setting = await this.repo.findOne({ key });
        if (!setting) {
          throw AppException.notFound(
            ApiErrorCode.SETTING_NOT_FOUND,
            `Setting with key "${key}" not found`,
          );
        }
        this.repo.assign(setting, { value: result.data });
        this.em.persist(setting);
        updatedEntitiesMap.set(key, setting);
      }

      await this.em.flush();
      return Array.from(updatedEntitiesMap.values());
    });
  }

  async updateManyAsDto(dtos: TSettingsUpdate): Promise<TSetting[]> {
    const settings = await this.updateMany(dtos);
    return settings.map((setting) => this.toDto(setting));
  }

  async update(
    key: ESettingKey,
    dto: { value: unknown },
  ): Promise<SettingsEntity> {
    const [updated] = await this.updateMany([
      { key, value: dto.value } as TSettingItemUpdate,
    ]);
    return updated;
  }

  async updateAsDto<K extends ESettingKey>(
    key: K,
    dto: { value: unknown },
  ): Promise<TSettingByKey<K>> {
    const setting = await this.update(key, dto);
    return this.toDto<K>(setting);
  }
}
