import { AppService } from './app.service';

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

  it('should default LOCAL_OBJECT_STORAGE_PATH to "/konvoez/files"', () => {
    delete process.env['LOCAL_OBJECT_STORAGE_PATH'];
    const service = new AppService();
    expect(service.LOCAL_OBJECT_STORAGE_PATH).toBe('/konvoez/files');
  });

  it('should read LOCAL_OBJECT_STORAGE_PATH from env', () => {
    process.env['LOCAL_OBJECT_STORAGE_PATH'] = '/custom/path';
    const service = new AppService();
    expect(service.LOCAL_OBJECT_STORAGE_PATH).toBe('/custom/path');
  });
});
