import {
  getBrowserName,
  isUnsubscribablePushError,
} from './notifications.utils';

describe('isUnsubscribablePushError', () => {
  it('should detect expired or missing subscriptions by status code', () => {
    expect(isUnsubscribablePushError({ statusCode: 404 })).toBe(true);
    expect(isUnsubscribablePushError({ statusCode: 410 })).toBe(true);
  });

  it('should ignore other errors', () => {
    expect(isUnsubscribablePushError({ statusCode: 500 })).toBe(false);
    expect(isUnsubscribablePushError(new Error('410 Gone'))).toBe(false);
    expect(isUnsubscribablePushError(null)).toBe(false);
    expect(isUnsubscribablePushError('gone')).toBe(false);
  });
});

describe('getBrowserName', () => {
  it('should return null without a user agent', () => {
    expect(getBrowserName()).toBeNull();
    expect(getBrowserName('')).toBeNull();
  });

  it('should detect Edge before Chromium', () => {
    expect(
      getBrowserName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      ),
    ).toBe('edge');
  });

  it('should detect Chrome even when Safari is present in the UA', () => {
    expect(
      getBrowserName(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('chrome');
  });

  it('should detect Safari only when it is not Chrome or Edge', () => {
    expect(
      getBrowserName(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBe('safari');
  });

  it('should detect Firefox', () => {
    expect(
      getBrowserName(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      ),
    ).toBe('firefox');
  });

  it('should return unknown for unrecognized agents', () => {
    expect(getBrowserName('KonvoezBot/1.0')).toBe('unknown');
  });
});
