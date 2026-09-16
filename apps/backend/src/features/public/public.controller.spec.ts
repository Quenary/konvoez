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
import { ESettingKey } from '@konvoez/shared';

describe('PublicController', () => {
  let controller: PublicController;
  let authService: jest.Mocked<Pick<AuthService, 'isOwnerSetupRequired'>>;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getValue'>>;

  beforeEach(async () => {
    authService = {
      isOwnerSetupRequired: jest.fn().mockResolvedValue(false),
    };
    settingsService = {
      getValue: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    controller = module.get<PublicController>(PublicController);
  });

  it('should return status ok on health check', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('should return public settings with isOwnerSetupRequired and inviteOnlySignUp', async () => {
    const settings = await controller.getSettings();
    expect(settings).toEqual({
      isOwnerSetupRequired: false,
      inviteOnlySignUp: true,
    });
    expect(settingsService.getValue).toHaveBeenCalledWith(
      ESettingKey.INVITE_ONLY_SIGN_UP,
    );
  });
});
