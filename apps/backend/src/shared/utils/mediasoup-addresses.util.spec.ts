import {
  DEFAULT_MEDIASOUP_PORT_RANGE,
  parseAnnouncedAddresses,
  parseMediasoupPortRange,
} from './mediasoup-addresses.util';

const fallback = { min: 41000, max: 41100 };

describe('parseMediasoupPortRange', () => {
  it.each([undefined, '', '  '])('defaults to 40000-40100 for %p', (value) => {
    expect(parseMediasoupPortRange(value)).toEqual(
      DEFAULT_MEDIASOUP_PORT_RANGE,
    );
    expect(DEFAULT_MEDIASOUP_PORT_RANGE).toEqual({ min: 40000, max: 40100 });
  });

  it('reads a start-end range', () => {
    expect(parseMediasoupPortRange(' 45000-45100 ')).toEqual({
      min: 45000,
      max: 45100,
    });
  });

  it('accepts a single-port range', () => {
    expect(parseMediasoupPortRange('45000-45000')).toEqual({
      min: 45000,
      max: 45000,
    });
  });

  it.each([
    'abc',
    '40000',
    '40000-',
    '-40100',
    '40000-40100-40200',
    '40000 - 40100',
    '40000.5-40100',
    '40100-40000',
    '0-100',
    '65000-65536',
    '99999-99999',
  ])('throws for %p naming the variable', (value) => {
    expect(() => parseMediasoupPortRange(value)).toThrow(
      `Invalid MEDIASOUP_PORT_RANGE "${value}"`,
    );
  });
});

describe('parseAnnouncedAddresses', () => {
  it.each([undefined, '', ' , '])(
    'defaults to 127.0.0.1 with the fallback range for %p',
    (value) => {
      expect(parseAnnouncedAddresses(value, fallback)).toEqual([
        { address: '127.0.0.1', portRange: fallback },
      ]);
    },
  );

  it('uses the fallback range for entries without their own', () => {
    expect(
      parseAnnouncedAddresses(' 192.168.0.10, my.ddns.example ', fallback),
    ).toEqual([
      { address: '192.168.0.10', portRange: fallback },
      { address: 'my.ddns.example', portRange: fallback },
    ]);
  });

  it('reads per-address ranges for IPv4 addresses and hostnames', () => {
    expect(
      parseAnnouncedAddresses(
        '203.0.113.5:40000-40049, my.ddns.example:40050-40100,192.168.0.10',
        fallback,
      ),
    ).toEqual([
      { address: '203.0.113.5', portRange: { min: 40000, max: 40049 } },
      { address: 'my.ddns.example', portRange: { min: 40050, max: 40100 } },
      { address: '192.168.0.10', portRange: fallback },
    ]);
  });

  it('keeps overlapping ranges and drops exact duplicates', () => {
    expect(
      parseAnnouncedAddresses(
        '192.168.0.10:40000-40060,203.0.113.5:40040-40100,192.168.0.10:40000-40060',
        fallback,
      ),
    ).toEqual([
      { address: '192.168.0.10', portRange: { min: 40000, max: 40060 } },
      { address: '203.0.113.5', portRange: { min: 40040, max: 40100 } },
    ]);
  });

  it.each([
    ['203.0.113.5:', ''],
    ['203.0.113.5:abc', 'abc'],
    ['203.0.113.5:40000', '40000'],
    ['my.ddns.example:40100-40000', '40100-40000'],
    ['203.0.113.5:0-10', '0-10'],
    ['203.0.113.5:40000-70000', '40000-70000'],
  ])('throws for the malformed range in %p', (entry, range) => {
    expect(() => parseAnnouncedAddresses(entry, fallback)).toThrow(
      `Invalid MEDIASOUP_ANNOUNCED_IP port range in "${entry}" "${range}"`,
    );
  });

  it.each([':40000-40100', 'bad host', 'bad_host:40000-40100'])(
    'throws for the malformed address in %p',
    (entry) => {
      expect(() => parseAnnouncedAddresses(entry, fallback)).toThrow(
        `Invalid MEDIASOUP_ANNOUNCED_IP entry "${entry}"`,
      );
    },
  );

  it.each(['2001:db8::1', '[2001:db8::1]:40000-40100', '::1'])(
    'rejects the IPv6 entry %p',
    (entry) => {
      expect(() => parseAnnouncedAddresses(entry, fallback)).toThrow(
        'IPv6 is not supported',
      );
    },
  );
});
