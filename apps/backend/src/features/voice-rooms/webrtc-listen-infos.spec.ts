jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('mediasoup/types', () => ({}), { virtual: true });

import { Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import {
  buildWebRtcListenInfos,
  resolveAnnouncedAddresses,
} from './webrtc-listen-infos';

const lookupMock = lookup as unknown as jest.Mock;
const shared = { min: 40000, max: 40100 };
const lanOnly = { min: 40050, max: 40100 };

describe('buildWebRtcListenInfos', () => {
  it('builds one UDP and one TCP socket for a single address', () => {
    expect(
      buildWebRtcListenInfos([{ address: '203.0.113.5', portRange: shared }]),
    ).toEqual([
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: '203.0.113.5',
        portRange: shared,
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress: '203.0.113.5',
        portRange: shared,
      },
    ]);
  });

  it('builds UDP then TCP entries in address order with their own ranges', () => {
    expect(
      buildWebRtcListenInfos([
        { address: '192.168.0.10', portRange: lanOnly },
        { address: '203.0.113.5', portRange: shared },
      ]),
    ).toEqual([
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: '192.168.0.10',
        portRange: lanOnly,
      },
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: '203.0.113.5',
        portRange: shared,
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress: '192.168.0.10',
        portRange: lanOnly,
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress: '203.0.113.5',
        portRange: shared,
      },
    ]);
  });
});

describe('resolveAnnouncedAddresses', () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('keeps IP addresses without a DNS lookup', async () => {
    const addresses = [{ address: '192.168.0.10', portRange: shared }];
    await expect(resolveAnnouncedAddresses(addresses)).resolves.toEqual(
      addresses,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('resolves a hostname to IPv4 and keeps its range', async () => {
    lookupMock.mockResolvedValue({ address: '203.0.113.5', family: 4 });

    await expect(
      resolveAnnouncedAddresses([
        { address: 'my.ddns.example', portRange: lanOnly },
      ]),
    ).resolves.toEqual([{ address: '203.0.113.5', portRange: lanOnly }]);
    expect(lookupMock).toHaveBeenCalledWith('my.ddns.example', { family: 4 });
  });

  it('drops a resolved duplicate only when the range matches too', async () => {
    lookupMock.mockResolvedValue({ address: '203.0.113.5', family: 4 });

    await expect(
      resolveAnnouncedAddresses([
        { address: 'my.ddns.example', portRange: shared },
        { address: '203.0.113.5', portRange: shared },
        { address: '203.0.113.5', portRange: lanOnly },
      ]),
    ).resolves.toEqual([
      { address: '203.0.113.5', portRange: shared },
      { address: '203.0.113.5', portRange: lanOnly },
    ]);
  });

  it('keeps a hostname that does not resolve and warns', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(
      resolveAnnouncedAddresses([
        { address: 'my.ddns.example', portRange: shared },
      ]),
    ).resolves.toEqual([{ address: 'my.ddns.example', portRange: shared }]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('my.ddns.example'),
    );
    warn.mockRestore();
  });
});
