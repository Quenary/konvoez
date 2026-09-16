jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@mikro-orm/core', () => {
  const createProxy = (): unknown =>
    new Proxy(() => createProxy(), {
      get: () => createProxy(),
      apply: () => createProxy(),
    });
  return {
    defineEntity: () => ({
      class: class {},
      setClass: () => undefined,
      addHook: () => undefined,
    }),
    p: createProxy(),
  };
});

import { SettingsService } from './settings.service';
import { SettingsEntity } from './settings.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { DEFAULT_ICE_SERVERS, ESettingKey } from '@konvoez/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SettingsService', () => {
  let service: SettingsService;
  let repo: jest.Mocked<EntityRepository<SettingsEntity>>;
  let em: jest.Mocked<EntityManager>;

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[ESettingKey.ICE_SERVERS];
    delete process.env[`SETTINGS_${ESettingKey.ICE_SERVERS}`];

    em = {
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
      fork: jest.fn(),
      getRepository: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    repo = {
      getEntityManager: jest.fn().mockReturnValue(em),
      findOne: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      assign: jest
        .fn()
        .mockImplementation((entity, data) => Object.assign(entity, data)),
    } as unknown as jest.Mocked<EntityRepository<SettingsEntity>>;

    em.fork.mockReturnValue(em);
    em.getRepository.mockReturnValue(
      repo as unknown as EntityRepository<object>,
    );

    service = new SettingsService(repo);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('onApplicationBootstrap', () => {
    it('should initialize setting with default value if not found in database', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.onApplicationBootstrap();

      expect(repo.create).toHaveBeenCalledWith({
        key: ESettingKey.ICE_SERVERS,
        value: DEFAULT_ICE_SERVERS,
      });
      expect(repo.create).toHaveBeenCalledWith({
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: true,
      });
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should keep existing valid setting from database if no env is set', async () => {
      const customIceServers = [{ urls: 'stun:custom.stun.com:3478' }];
      const existingIceSetting = {
        key: ESettingKey.ICE_SERVERS,
        value: customIceServers,
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;
      const existingInviteSetting = {
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: true,
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;

      repo.findOne.mockImplementation(async ({ key }: { key: ESettingKey }) => {
        if (key === ESettingKey.ICE_SERVERS) return existingIceSetting;
        if (key === ESettingKey.INVITE_ONLY_SIGN_UP)
          return existingInviteSetting;
        return null;
      });

      await service.onApplicationBootstrap();

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.assign).not.toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should reset setting to default value if database value is invalid', async () => {
      const invalidSetting = {
        key: ESettingKey.ICE_SERVERS,
        value: { notAnArray: true },
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;
      const validInviteSetting = {
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: true,
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;

      repo.findOne.mockImplementation(async ({ key }: { key: ESettingKey }) => {
        if (key === ESettingKey.ICE_SERVERS) return invalidSetting;
        if (key === ESettingKey.INVITE_ONLY_SIGN_UP) return validInviteSetting;
        return null;
      });

      await service.onApplicationBootstrap();

      expect(repo.assign).toHaveBeenCalledWith(invalidSetting, {
        value: DEFAULT_ICE_SERVERS,
      });
      expect(em.flush).toHaveBeenCalled();
    });

    it('should overwrite setting from environment if valid (env priority)', async () => {
      const envIceServers = [{ urls: 'stun:env.stun.com:19302' }];
      process.env[ESettingKey.ICE_SERVERS] = JSON.stringify(envIceServers);

      const existingSetting = {
        key: ESettingKey.ICE_SERVERS,
        value: DEFAULT_ICE_SERVERS,
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;
      const validInviteSetting = {
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: true,
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;

      repo.findOne.mockImplementation(async ({ key }: { key: ESettingKey }) => {
        if (key === ESettingKey.ICE_SERVERS) return existingSetting;
        if (key === ESettingKey.INVITE_ONLY_SIGN_UP) return validInviteSetting;
        return null;
      });

      await service.onApplicationBootstrap();

      expect(repo.assign).toHaveBeenCalledWith(existingSetting, {
        value: envIceServers,
      });
      expect(em.flush).toHaveBeenCalled();
    });

    it('should create setting from environment if not in db and valid in env', async () => {
      const envIceServers = [{ urls: 'stun:env.stun.com:19302' }];
      process.env[ESettingKey.ICE_SERVERS] = JSON.stringify(envIceServers);

      repo.findOne.mockResolvedValue(null);

      await service.onApplicationBootstrap();

      expect(repo.create).toHaveBeenCalledWith({
        key: ESettingKey.ICE_SERVERS,
        value: envIceServers,
      });
      expect(repo.create).toHaveBeenCalledWith({
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: true,
      });
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });

    it('should ignore invalid environment value and keep valid database value', async () => {
      process.env[ESettingKey.ICE_SERVERS] = 'invalid-json-or-schema';

      const existingSetting = {
        key: ESettingKey.ICE_SERVERS,
        value: DEFAULT_ICE_SERVERS,
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;
      const validInviteSetting = {
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: true,
        createdAt: new Date(),
        updatedAt: null,
      } as unknown as SettingsEntity;

      repo.findOne.mockImplementation(async ({ key }: { key: ESettingKey }) => {
        if (key === ESettingKey.ICE_SERVERS) return existingSetting;
        if (key === ESettingKey.INVITE_ONLY_SIGN_UP) return validInviteSetting;
        return null;
      });

      await service.onApplicationBootstrap();

      expect(repo.assign).not.toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
    });
  });

  describe('findOne and getValue', () => {
    it('should return setting when found', async () => {
      const mockSetting = {
        key: ESettingKey.ICE_SERVERS,
        value: DEFAULT_ICE_SERVERS,
      } as SettingsEntity;

      repo.findOne.mockResolvedValue(mockSetting);

      const result = await service.findOne(ESettingKey.ICE_SERVERS);
      expect(result).toBe(mockSetting);
      expect(repo.findOne).toHaveBeenCalledWith({
        key: ESettingKey.ICE_SERVERS,
      });
    });

    it('should throw NotFoundException when setting not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne(ESettingKey.ICE_SERVERS)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return value directly in getValue', async () => {
      const mockSetting = {
        key: ESettingKey.ICE_SERVERS,
        value: DEFAULT_ICE_SERVERS,
      } as SettingsEntity;

      repo.findOne.mockResolvedValue(mockSetting);

      const value = await service.getValue(ESettingKey.ICE_SERVERS);
      expect(value).toEqual(DEFAULT_ICE_SERVERS);
    });
  });

  describe('findAll', () => {
    it('should return all settings from repository', async () => {
      const list = [
        { key: ESettingKey.ICE_SERVERS, value: DEFAULT_ICE_SERVERS },
      ] as SettingsEntity[];
      repo.findAll.mockResolvedValue(list);

      const res = await service.findAll();
      expect(res).toBe(list);
    });
  });

  describe('update', () => {
    it('should validate and update setting value', async () => {
      const existingSetting = {
        key: ESettingKey.ICE_SERVERS,
        value: DEFAULT_ICE_SERVERS,
      } as SettingsEntity;

      repo.findOne.mockResolvedValue(existingSetting);

      const newIceServers = [{ urls: 'stun:new.example.com:3478' }];
      const result = await service.update(ESettingKey.ICE_SERVERS, {
        value: newIceServers,
      });

      expect(repo.assign).toHaveBeenCalledWith(existingSetting, {
        value: newIceServers,
      });
      expect(em.persist).toHaveBeenCalledWith(existingSetting);
      expect(em.flush).toHaveBeenCalled();
      expect(result).toBe(existingSetting);
    });

    it('should throw BadRequestException if update value fails validation', async () => {
      await expect(
        service.update(ESettingKey.ICE_SERVERS, {
          value: 'not-an-array',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
