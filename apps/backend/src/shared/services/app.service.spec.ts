import { AppService } from './app.service';
import * as storageUtils from '../storage.utils';

describe('AppService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should default OBJECT_STORAGE to "local" when unset', () => {
    delete process.env['OBJECT_STORAGE'];
    const service = new AppService();
    expect(service.OBJECT_STORAGE).toBe('local');
  });

  it('should default OBJECT_STORAGE to "local" when invalid value provided', () => {
    process.env['OBJECT_STORAGE'] = 'invalid_storage';
    const service = new AppService();
    expect(service.OBJECT_STORAGE).toBe('local');
  });

  it('should set OBJECT_STORAGE to "s3" case-insensitively', () => {
    process.env['OBJECT_STORAGE'] = 'S3';
    const service = new AppService();
    expect(service.OBJECT_STORAGE).toBe('s3');
  });

  it('should default LOCAL_OBJECT_STORAGE_PATH using getDefaultLocalStoragePath when unset', () => {
    delete process.env['LOCAL_OBJECT_STORAGE_PATH'];
    const spy = jest
      .spyOn(storageUtils, 'getDefaultLocalStoragePath')
      .mockReturnValue('.konvoez_data/files');
    const service = new AppService();
    expect(service.LOCAL_OBJECT_STORAGE_PATH).toBe('.konvoez_data/files');
    spy.mockRestore();
  });

  it('should read LOCAL_OBJECT_STORAGE_PATH from env', () => {
    process.env['LOCAL_OBJECT_STORAGE_PATH'] = '/custom/path';
    const service = new AppService();
    expect(service.LOCAL_OBJECT_STORAGE_PATH).toBe('/custom/path');
  });

  it('should default MEDIASOUP_MIN_PORT and MEDIASOUP_MAX_PORT to 40000 and 40100', () => {
    delete process.env['MEDIASOUP_MIN_PORT'];
    delete process.env['MEDIASOUP_MAX_PORT'];
    const service = new AppService();
    expect(service.MEDIASOUP_MIN_PORT).toBe(40000);
    expect(service.MEDIASOUP_MAX_PORT).toBe(40100);
  });

  it('should read MEDIASOUP_MIN_PORT and MEDIASOUP_MAX_PORT from env', () => {
    process.env['MEDIASOUP_MIN_PORT'] = '45000';
    process.env['MEDIASOUP_MAX_PORT'] = '45100';
    const service = new AppService();
    expect(service.MEDIASOUP_MIN_PORT).toBe(45000);
    expect(service.MEDIASOUP_MAX_PORT).toBe(45100);
  });
});
