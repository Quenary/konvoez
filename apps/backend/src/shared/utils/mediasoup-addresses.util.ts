import { isIP } from 'net';

export interface IPortRange {
  readonly min: number;
  readonly max: number;
}

export interface IAnnouncedAddress {
  /** IPv4 address or hostname. */
  readonly address: string;
  readonly portRange: IPortRange;
}

export const DEFAULT_MEDIASOUP_PORT_RANGE: IPortRange = {
  min: 40000,
  max: 40100,
};

const DEFAULT_ANNOUNCED_ADDRESS = '127.0.0.1';
const PORT_RANGE_PATTERN = /^(\d{1,5})-(\d{1,5})$/;
const HOSTNAME_PATTERN = /^[A-Za-z0-9.-]+$/;

/** Parses `start-end`; throws with `source` in the message when malformed. */
export function parsePortRange(value: string, source: string): IPortRange {
  const match = PORT_RANGE_PATTERN.exec(value.trim());
  const min = Number(match?.[1]);
  const max = Number(match?.[2]);
  if (!match || min < 1 || max > 65535 || min > max) {
    throw new Error(
      `Invalid ${source} "${value}": expected a port range "start-end" with 1 <= start <= end <= 65535`,
    );
  }
  return { min, max };
}

/** MEDIASOUP_PORT_RANGE, or the default range when unset or empty. */
export function parseMediasoupPortRange(value: string | undefined): IPortRange {
  return value?.trim()
    ? parsePortRange(value, 'MEDIASOUP_PORT_RANGE')
    : DEFAULT_MEDIASOUP_PORT_RANGE;
}

/**
 * MEDIASOUP_ANNOUNCED_IP: comma-separated `address[:start-end]` entries, in
 * preference order. Entries without a range use `fallback`.
 */
export function parseAnnouncedAddresses(
  value: string | undefined,
  fallback: IPortRange,
): IAnnouncedAddress[] {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (!entries.length) {
    return [{ address: DEFAULT_ANNOUNCED_ADDRESS, portRange: fallback }];
  }
  const unique = new Map<string, IAnnouncedAddress>();
  for (const entry of entries) {
    const announced = parseAnnouncedAddress(entry, fallback);
    unique.set(announcedAddressKey(announced), announced);
  }
  return [...unique.values()];
}

export function announcedAddressKey({
  address,
  portRange,
}: IAnnouncedAddress): string {
  return `${address}:${portRange.min}-${portRange.max}`;
}

function parseAnnouncedAddress(
  entry: string,
  fallback: IPortRange,
): IAnnouncedAddress {
  const colon = entry.lastIndexOf(':');
  const address = colon < 0 ? entry : entry.slice(0, colon).trim();
  // mediasoup listens on IPv4 0.0.0.0, so an IPv6 candidate is unreachable.
  if (entry.startsWith('[') || isIP(entry) === 6 || address.includes(':')) {
    throw new Error(
      `Invalid MEDIASOUP_ANNOUNCED_IP entry "${entry}": IPv6 is not supported, use an IPv4 address or hostname`,
    );
  }
  if (!isIP(address) && !HOSTNAME_PATTERN.test(address)) {
    throw new Error(
      `Invalid MEDIASOUP_ANNOUNCED_IP entry "${entry}": expected an IPv4 address or hostname with an optional ":start-end" port range`,
    );
  }
  return {
    address,
    portRange:
      colon < 0
        ? fallback
        : parsePortRange(
            entry.slice(colon + 1),
            `MEDIASOUP_ANNOUNCED_IP port range in "${entry}"`,
          ),
  };
}
