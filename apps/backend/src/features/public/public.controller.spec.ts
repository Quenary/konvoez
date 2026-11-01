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
    Cascade: {},
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { PublicController } from './public.controller';
import { AuthService } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '@shared/services/mail.service';
import { PublicService } from './public.service';
import { ESettingKey } from '@konvoez/shared';

describe('PublicController', () => {
  let controller: PublicController;
  let authService: jest.Mocked<Pick<AuthService, 'isOwnerSetupRequired'>>;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getValue'>>;
  let mailService: { isConfigured: boolean };
  let publicService: jest.Mocked<Pick<PublicService, 'getVersion'>>;

  beforeEach(async () => {
    authService = {
      isOwnerSetupRequired: jest.fn().mockResolvedValue(false),
    };
    settingsService = {
      getValue: jest.fn().mockImplementation(async (key) => {
        if (key === ESettingKey.INVITE_ONLY_SIGN_UP) return true;
        return false;
      }),
    };
    mailService = {
      isConfigured: true,
    };
    publicService = {
      getVersion: jest.fn().mockResolvedValue({
        currentVersion: '1.5.1',
        availableVersion: '1.5.1',
        releaseUrl: null,
        updateAvailable: false,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SettingsService, useValue: settingsService },
        { provide: MailService, useValue: mailService },
        { provide: PublicService, useValue: publicService },
      ],
    }).compile();

    controller = module.get<PublicController>(PublicController);
  });

  it('should return status ok on health check', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('should return public settings with isOwnerSetupRequired, inviteOnlySignUp and smtpConfigured', async () => {
    const settings = await controller.getSettings();
    expect(settings).toEqual({
      isOwnerSetupRequired: false,
      inviteOnlySignUp: true,
      smtpConfigured: true,
    });
    expect(settingsService.getValue).toHaveBeenCalledWith(
      ESettingKey.INVITE_ONLY_SIGN_UP,
    );
  });

  it('should report smtpConfigured as false when mail is not configured', async () => {
    mailService.isConfigured = false;
    const settings = await controller.getSettings();
    expect(settings.smtpConfigured).toBe(false);
  });

  it('should return version info from PublicService', async () => {
    const version = await controller.getVersion();
    expect(version).toEqual({
      currentVersion: '1.5.1',
      availableVersion: '1.5.1',
      releaseUrl: null,
      updateAvailable: false,
    });
    expect(publicService.getVersion).toHaveBeenCalled();
  });
});
