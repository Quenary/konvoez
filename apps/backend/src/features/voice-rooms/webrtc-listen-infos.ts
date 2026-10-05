import { Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import type { TransportListenInfo } from 'mediasoup/types';
import {
  announcedAddressKey,
  type IAnnouncedAddress,
} from '@shared/utils/mediasoup-addresses.util';

const logger = new Logger('WebRtcListenInfos');

/**
 * One UDP and one TCP socket per announced address, each bound to a port from
 * that address's range. mediasoup ranks candidates in this order: all UDP
 * before TCP, then the announced address order.
 */
export function buildWebRtcListenInfos(
  announcedAddresses: readonly IAnnouncedAddress[],
): TransportListenInfo[] {
  return (['udp', 'tcp'] as const).flatMap((protocol) =>
    announcedAddresses.map(({ address, portRange }): TransportListenInfo => ({
      protocol,
      ip: '0.0.0.0',
      announcedAddress: address,
      portRange,
    })),
  );
}

/**
 * Resolves hostnames to IPv4 on every call, so a DDNS change applies to new
 * transports. Firefox ignores remote ICE candidates with a hostname. A name
 * that does not resolve stays as is for browsers that resolve it themselves.
 */
export async function resolveAnnouncedAddresses(
  announcedAddresses: readonly IAnnouncedAddress[],
): Promise<IAnnouncedAddress[]> {
  const resolved = await Promise.all(
    announcedAddresses.map(async (announced) => ({
      ...announced,
      address: await resolveAddress(announced.address),
    })),
  );
  const unique = new Map(
    resolved.map((announced) => [announcedAddressKey(announced), announced]),
  );
  return [...unique.values()];
}

async function resolveAddress(address: string): Promise<string> {
  if (isIP(address)) {
    return address;
  }
  try {
    return (await lookup(address, { family: 4 })).address;
  } catch (error: unknown) {
    logger.warn(
      `Failed to resolve announced address ${address}: ${error instanceof Error ? error.message : error}`,
    );
    return address;
  }
}
