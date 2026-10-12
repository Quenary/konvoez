import { describe, expect, it, vi } from 'vitest';
import { normalizeServerOrigin, probeServer } from './server-url';

describe('normalizeServerOrigin', () => {
  it('adds https protocol by default and strips paths', () => {
    expect(normalizeServerOrigin('konvoez.example.com/chat/room')).toBe(
      'https://konvoez.example.com',
    );
    expect(normalizeServerOrigin('konvoez.example.com:8443/api')).toBe(
      'https://konvoez.example.com:8443',
    );
  });

  it('keeps existing https protocol', () => {
    expect(normalizeServerOrigin('https://chat.example.com/login')).toBe(
      'https://chat.example.com',
    );
  });

  it('allows http for localhost and 127.0.0.1', () => {
    expect(normalizeServerOrigin('http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
    expect(normalizeServerOrigin('http://127.0.0.1:8080/nested')).toBe(
      'http://127.0.0.1:8080',
    );
  });

  it('rejects http for non-localhost hosts with INSECURE error', () => {
    expect(() => normalizeServerOrigin('http://insecure.example.com')).toThrow(
      'INSECURE',
    );
  });

  it('rejects garbage and empty inputs', () => {
    expect(() => normalizeServerOrigin('')).toThrow('INVALID_URL');
    expect(() => normalizeServerOrigin('   ')).toThrow('INVALID_URL');
    expect(() => normalizeServerOrigin('ftp://some-host')).toThrow('INSECURE');
  });
});

describe('probeServer', () => {
  it('returns version when endpoint responds with valid schema', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        currentVersion: '1.14.0',
        availableVersion: '1.14.0',
        releaseUrl: null,
        updateAvailable: false,
      }),
    });

    const result = await probeServer(
      'https://konvoez.example.com',
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({ version: '1.14.0' });
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://konvoez.example.com/api/v1/public/version',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws HTTP_<status> on non-ok status', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(
      probeServer(
        'https://konvoez.example.com',
        fakeFetch as unknown as typeof fetch,
      ),
    ).rejects.toThrow('HTTP_404');
  });

  it('throws INVALID_RESPONSE when response shape is invalid', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    });

    await expect(
      probeServer(
        'https://konvoez.example.com',
        fakeFetch as unknown as typeof fetch,
      ),
    ).rejects.toThrow('INVALID_RESPONSE');
  });

  it('throws timeout error when request is aborted', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('Timeout'));

    await expect(
      probeServer(
        'https://konvoez.example.com',
        fakeFetch as unknown as typeof fetch,
      ),
    ).rejects.toThrow('Timeout');
  });
});
