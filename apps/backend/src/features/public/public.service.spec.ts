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
import { Cache } from '@nestjs/cache-manager';
import { PublicService } from './public.service';
import { AppService } from '@shared/services/app.service';
import { IPublicVersion } from '@konvoez/shared';

describe('PublicService', () => {
  let service: PublicService;
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
  };
  let fetchMock: jest.Mock;
  let appService: { GITHUB_TOKEN: string | undefined };

  const cachedPayload: IPublicVersion = {
    currentVersion: '1.5.1',
    availableVersion: '1.6.0',
    releaseUrl: 'https://github.com/Quenary/konvoez/releases/tag/v1.6.0',
    updateAvailable: true,
  };

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    appService = { GITHUB_TOKEN: undefined };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicService,
        { provide: Cache, useValue: cacheManager },
        { provide: AppService, useValue: appService },
      ],
    }).compile();

    service = module.get<PublicService>(PublicService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return cached version info without calling GitHub', async () => {
    cacheManager.get.mockResolvedValueOnce(cachedPayload);

    const result = await service.getVersion();

    expect(result).toEqual(cachedPayload);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheManager.set).not.toHaveBeenCalled();
  });

  it('should fetch GitHub release, detect update, and cache the result', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v1.6.0',
        html_url: 'https://github.com/Quenary/konvoez/releases/tag/v1.6.0',
      }),
    });

    // Force known current version via prototype override of private field
    Object.defineProperty(service, 'currentVersion', {
      value: '1.5.1',
    });

    const result = await service.getVersion();

    expect(result).toEqual({
      currentVersion: '1.5.1',
      availableVersion: '1.6.0',
      releaseUrl: 'https://github.com/Quenary/konvoez/releases/tag/v1.6.0',
      updateAvailable: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/Quenary/konvoez/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          'User-Agent': 'konvoez',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(cacheManager.set).toHaveBeenCalledWith(
      'public:version',
      result,
      60 * 60 * 1000,
    );
  });

  it('should send Authorization Bearer when GITHUB_TOKEN is set', async () => {
    appService.GITHUB_TOKEN = 'ghp_test_token';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.1',
        html_url: 'https://github.com/Quenary/konvoez/releases/tag/v1.5.1',
      }),
    });

    Object.defineProperty(service, 'currentVersion', {
      value: '1.5.1',
    });

    await service.getVersion();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/Quenary/konvoez/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_test_token',
        }),
      }),
    );
  });

  it('should report no update when latest tag is not newer', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v1.5.1',
        html_url: 'https://github.com/Quenary/konvoez/releases/tag/v1.5.1',
      }),
    });

    Object.defineProperty(service, 'currentVersion', {
      value: '1.5.1',
    });

    const result = await service.getVersion();

    expect(result).toEqual({
      currentVersion: '1.5.1',
      availableVersion: '1.5.1',
      releaseUrl: null,
      updateAvailable: false,
    });
  });

  it('should fall back gracefully when GitHub request fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));

    Object.defineProperty(service, 'currentVersion', {
      value: '1.5.1',
    });

    const result = await service.getVersion();

    expect(result).toEqual({
      currentVersion: '1.5.1',
      availableVersion: '1.5.1',
      releaseUrl: null,
      updateAvailable: false,
    });
    expect(cacheManager.set).toHaveBeenCalledWith(
      'public:version',
      result,
      60 * 60 * 1000,
    );
  });

  it('should fall back gracefully when GitHub returns non-ok status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    Object.defineProperty(service, 'currentVersion', {
      value: '1.5.1',
    });

    const result = await service.getVersion();

    expect(result).toEqual({
      currentVersion: '1.5.1',
      availableVersion: '1.5.1',
      releaseUrl: null,
      updateAvailable: false,
    });
  });
});
