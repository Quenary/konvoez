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

  it('should reject an invalid OBJECT_STORAGE_PREFIX', () => {
    process.env['OBJECT_STORAGE_PREFIX'] = 'Bad.Prefix';
    expect(() => new AppService()).toThrow(/OBJECT_STORAGE_PREFIX/);
  });

  it('should default the upload temp dir next to local storage', () => {
    process.env['LOCAL_OBJECT_STORAGE_PATH'] = '/data/files';
    delete process.env['UPLOAD_TMP_DIR'];
    delete process.env['OBJECT_STORAGE_PREFIX'];
    const service = new AppService();
    expect(service.UPLOAD_TMP_DIR).toBe('/data/files/.tmp');
  });

  it('should read LOCAL_OBJECT_STORAGE_PATH from env', () => {
    process.env['LOCAL_OBJECT_STORAGE_PATH'] = '/custom/path';
    const service = new AppService();
    expect(service.LOCAL_OBJECT_STORAGE_PATH).toBe('/custom/path');
  });

  it('should default the mediasoup port range and announced address', () => {
    delete process.env['MEDIASOUP_PORT_RANGE'];
    delete process.env['MEDIASOUP_ANNOUNCED_IP'];
    const service = new AppService();
    const portRange = { min: 40000, max: 40100 };
    expect(service.MEDIASOUP_PORT_RANGE).toEqual(portRange);
    expect(service.MEDIASOUP_ANNOUNCED_ADDRESSES).toEqual([
      { address: '127.0.0.1', portRange },
    ]);
  });

  it('should use MEDIASOUP_PORT_RANGE for addresses without their own range', () => {
    process.env['MEDIASOUP_PORT_RANGE'] = '45000-45100';
    process.env['MEDIASOUP_ANNOUNCED_IP'] =
      '192.168.0.10:45050-45100, my.ddns.example';
    const service = new AppService();
    expect(service.MEDIASOUP_PORT_RANGE).toEqual({ min: 45000, max: 45100 });
    expect(service.MEDIASOUP_ANNOUNCED_ADDRESSES).toEqual([
      { address: '192.168.0.10', portRange: { min: 45050, max: 45100 } },
      { address: 'my.ddns.example', portRange: { min: 45000, max: 45100 } },
    ]);
  });

  it('should fail to start on a malformed MEDIASOUP_PORT_RANGE', () => {
    process.env['MEDIASOUP_PORT_RANGE'] = '40100-40000';
    expect(() => new AppService()).toThrow(
      'Invalid MEDIASOUP_PORT_RANGE "40100-40000"',
    );
  });

  it('should fail to start on a malformed MEDIASOUP_ANNOUNCED_IP range', () => {
    delete process.env['MEDIASOUP_PORT_RANGE'];
    process.env['MEDIASOUP_ANNOUNCED_IP'] = '203.0.113.5:40000-x';
    expect(() => new AppService()).toThrow(
      'Invalid MEDIASOUP_ANNOUNCED_IP port range in "203.0.113.5:40000-x"',
    );
  });
});
