import {
  DEFAULT_STREAM_VIDEO_CODEC,
  recommendStreamBitrateKbps,
  TStreamContentMode,
  TStreamVideoCodec,
} from '@konvoez/shared';

const BASE_VIDEO_CODECS = [
  'vp9',
  'vp8',
] as const satisfies readonly TStreamVideoCodec[];

const HARDWARE_ENCODER_PROBE_TIMEOUT_MS = 500;

const AV1_CONTENT_TYPE = 'video/AV1';
/** Constrained Baseline. The interoperable router profile. */
export const H264_CONSTRAINED_BASELINE_PROFILE = '42e01f';
/** High profile, level 5.0. Used when the hardware encoder does not offer Constrained Baseline. */
export const H264_HIGH_PROFILE = '640032';

const H264_PROBE_PROFILES = [
  H264_CONSTRAINED_BASELINE_PROFILE,
  H264_HIGH_PROFILE,
] as const;

export type TH264HardwareProfile = (typeof H264_PROBE_PROFILES)[number];

const NO_HARDWARE_ENCODERS: THardwareVideoEncoders = {
  av1: false,
  h264: false,
  h264Profile: null,
};

export type THardwareVideoEncoders = {
  readonly av1: boolean;
  readonly h264: boolean;
  readonly h264Profile: TH264HardwareProfile | null;
};

export type THardwareEncoderProbe = {
  readonly width: number;
  readonly height: number;
  readonly framerate: number;
  readonly bitrate: number;
};

type THardwareEncoderCacheEntry = {
  readonly av1?: boolean;
  /** `null` is a finished probe with no hardware profile. Absent means not probed. */
  readonly h264Profile?: TH264HardwareProfile | null;
};

const hardwareEncoderCache = new Map<string, THardwareEncoderCacheEntry>();

function hasMime(mimes: readonly string[], codec: TStreamVideoCodec): boolean {
  const mime = `video/${codec}`;
  return mimes.some((item) => item.toLowerCase() === mime);
}

function bothCanUse(
  codec: TStreamVideoCodec,
  senderMimes: readonly string[],
  deviceMimes: readonly string[] | null,
): boolean {
  return (
    deviceMimes != null &&
    hasMime(senderMimes, codec) &&
    hasMime(deviceMimes, codec)
  );
}

function deviceCanSend(
  codec: TStreamVideoCodec,
  deviceMimes: readonly string[] | null,
): boolean {
  return deviceMimes != null && hasMime(deviceMimes, codec);
}

/** Best quality first. A codec is offered only when the device can send it. AV1 and H.264 also require the sender. */
export function availableVideoCodecs(input: {
  senderMimes: readonly string[];
  deviceMimes: readonly string[] | null;
}): TStreamVideoCodec[] {
  const codecs: TStreamVideoCodec[] = [];
  if (bothCanUse('av1', input.senderMimes, input.deviceMimes)) {
    codecs.push('av1');
  }
  if (bothCanUse('h264', input.senderMimes, input.deviceMimes)) {
    codecs.push('h264');
  }
  for (const codec of BASE_VIDEO_CODECS) {
    if (deviceCanSend(codec, input.deviceMimes)) {
      codecs.push(codec);
    }
  }
  return codecs;
}

export function deviceCanReceiveCodec(
  deviceMimes: readonly string[],
  codec: TStreamVideoCodec,
): boolean {
  return hasMime(deviceMimes, codec);
}

/**
 * Saved choice wins outside this function. Otherwise hardware AV1, then
 * hardware H.264, then VP9, then VP8. VP9 is not probed.
 */
export function pickDefaultVideoCodec(input: {
  available: readonly TStreamVideoCodec[];
  hardware: Pick<THardwareVideoEncoders, 'av1' | 'h264'>;
}): TStreamVideoCodec {
  if (input.hardware.av1 && input.available.includes('av1')) {
    return 'av1';
  }
  if (input.hardware.h264 && input.available.includes('h264')) {
    return 'h264';
  }
  if (input.available.includes(DEFAULT_STREAM_VIDEO_CODEC)) {
    return DEFAULT_STREAM_VIDEO_CODEC;
  }
  if (input.available.includes('vp8')) {
    return 'vp8';
  }
  return input.available[0] ?? DEFAULT_STREAM_VIDEO_CODEC;
}

/** Even 16:9 width for a target height. A positive source width replaces it. */
export function streamProbeWidth(height: number, sourceWidth?: number): number {
  if (sourceWidth != null && sourceWidth > 0) {
    return Math.round(sourceWidth);
  }
  return Math.round((height * 16) / 9 / 2) * 2;
}

/** Stored cap, or the VP9 recommendation when the user has not set one. */
export function streamProbeBitrateKbps(input: {
  height: number;
  fps: number;
  contentMode: TStreamContentMode;
  maxKbps: number;
  bitrateKbps: number | null;
}): number {
  if (input.bitrateKbps != null) {
    return input.bitrateKbps;
  }
  return recommendStreamBitrateKbps({
    height: input.height,
    fps: input.fps,
    contentMode: input.contentMode,
    maxKbps: input.maxKbps,
    codec: DEFAULT_STREAM_VIDEO_CODEC,
  });
}

export function hardwareEncoderProbe(input: {
  height: number;
  fps: number;
  bitrateKbps: number;
  sourceWidth?: number;
}): THardwareEncoderProbe {
  return {
    width: streamProbeWidth(input.height, input.sourceWidth),
    height: input.height,
    framerate: input.fps,
    bitrate: input.bitrateKbps * 1000,
  };
}

function hardwareEncoderCacheKey(probe: THardwareEncoderProbe): string {
  return `${probe.width}x${probe.height}@${probe.framerate}@${probe.bitrate}`;
}

function hardwareEncodersFromEntry(
  entry: THardwareEncoderCacheEntry | undefined,
): THardwareVideoEncoders {
  if (!entry) {
    return NO_HARDWARE_ENCODERS;
  }
  return {
    av1: entry.av1 ?? false,
    h264: entry.h264Profile != null,
    h264Profile: entry.h264Profile ?? null,
  };
}

export function cachedHardwareEncoders(
  probe: THardwareEncoderProbe,
): THardwareVideoEncoders {
  return hardwareEncodersFromEntry(
    hardwareEncoderCache.get(hardwareEncoderCacheKey(probe)),
  );
}

export function clearHardwareEncoderCache(): void {
  hardwareEncoderCache.clear();
}

/**
 * Profile chosen for this size and frame rate. An exact parameter-set hit wins.
 * A different bitrate at the same size still counts: the profile match does not
 * depend on it. A cold cache stays on Constrained Baseline.
 */
export function cachedH264Profile(
  probe: THardwareEncoderProbe,
): TH264HardwareProfile | null {
  const exact = hardwareEncoderCache.get(hardwareEncoderCacheKey(probe));
  if (exact && 'h264Profile' in exact) {
    return exact.h264Profile ?? null;
  }
  const prefix = `${probe.width}x${probe.height}@${probe.framerate}@`;
  for (const [key, value] of hardwareEncoderCache) {
    if (key.startsWith(prefix) && value.h264Profile) {
      return value.h264Profile;
    }
  }
  return null;
}

function h264ProbeContentType(profile: TH264HardwareProfile): string {
  return `video/H264;profile-level-id=${profile};packetization-mode=1`;
}

export function h264ProfileLevelId(
  parameters: Record<string, unknown> | undefined,
): string | null {
  const value = parameters?.['profile-level-id'];
  return typeof value === 'string' ? value.toLowerCase() : null;
}

/** Hardware profile when the device offers it, otherwise Constrained Baseline. */
export function pickH264Codec<
  T extends { parameters?: Record<string, unknown> },
>(
  codecs: readonly T[],
  hardwareProfile: TH264HardwareProfile | null,
): T | undefined {
  const preferred = hardwareProfile ?? H264_CONSTRAINED_BASELINE_PROFILE;
  return (
    codecs.find(
      (codec) => h264ProfileLevelId(codec.parameters) === preferred,
    ) ??
    codecs.find(
      (codec) =>
        h264ProfileLevelId(codec.parameters) ===
        H264_CONSTRAINED_BASELINE_PROFILE,
    ) ??
    codecs[0]
  );
}

type TEncoderProbeOutcome = 'hardware' | 'software' | 'unknown';

function logEncoderProbe(
  contentType: string,
  probe: THardwareEncoderProbe,
  result: TEncoderProbeOutcome,
): void {
  console.debug('Hardware encoder probe', {
    contentType,
    width: probe.width,
    height: probe.height,
    framerate: probe.framerate,
    bitrate: probe.bitrate,
    result,
  });
}

async function probeEncoder(
  contentType: string,
  probe: THardwareEncoderProbe,
): Promise<TEncoderProbeOutcome> {
  const mediaCapabilities = globalThis.navigator?.mediaCapabilities;
  if (!mediaCapabilities?.encodingInfo) {
    logEncoderProbe(contentType, probe, 'software');
    return 'software';
  }
  const pending = mediaCapabilities
    .encodingInfo({
      type: 'webrtc',
      video: {
        contentType,
        width: probe.width,
        height: probe.height,
        bitrate: probe.bitrate,
        framerate: probe.framerate,
      },
    })
    .then((info): TEncoderProbeOutcome =>
      info.supported === true && info.powerEfficient === true
        ? 'hardware'
        : 'software',
    )
    .catch((): TEncoderProbeOutcome => 'unknown');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TEncoderProbeOutcome>((resolve) => {
    timeoutId = setTimeout(
      () => resolve('unknown'),
      HARDWARE_ENCODER_PROBE_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([pending, timeout]);
    logEncoderProbe(contentType, probe, result);
    return result;
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Constrained Baseline first, then High. Stops at the first hardware profile.
 * An unknown answer ends the ladder: a later profile is not a result.
 */
async function probeH264(probe: THardwareEncoderProbe): Promise<{
  definitive: boolean;
  profile: TH264HardwareProfile | null;
}> {
  for (const profile of H264_PROBE_PROFILES) {
    const outcome = await probeEncoder(h264ProbeContentType(profile), probe);
    if (outcome === 'hardware') {
      return { definitive: true, profile };
    }
    if (outcome === 'unknown') {
      return { definitive: false, profile: null };
    }
  }
  return { definitive: true, profile: null };
}

/**
 * AV1 and H.264 hardware encode support for one parameter set.
 * Each definitive answer is cached on its own. A timeout or a thrown probe
 * is not, and it does not drop the other codec's answer.
 */
export async function detectHardwareEncoders(
  probe: THardwareEncoderProbe,
): Promise<THardwareVideoEncoders> {
  const key = hardwareEncoderCacheKey(probe);
  const entry = hardwareEncoderCache.get(key) ?? {};
  const av1Known = typeof entry.av1 === 'boolean';
  const h264Known = 'h264Profile' in entry;
  if (av1Known && h264Known) {
    const cached = hardwareEncodersFromEntry(entry);
    console.debug('Hardware encoder probe cache', { ...probe, ...cached });
    return cached;
  }
  const [av1, h264] = await Promise.all([
    av1Known
      ? Promise.resolve<TEncoderProbeOutcome>(
          entry.av1 ? 'hardware' : 'software',
        )
      : probeEncoder(AV1_CONTENT_TYPE, probe),
    h264Known
      ? Promise.resolve({
          definitive: true,
          profile: entry.h264Profile ?? null,
        })
      : probeH264(probe),
  ]);
  const next: THardwareEncoderCacheEntry = {
    ...entry,
    ...(!av1Known && av1 !== 'unknown' ? { av1: av1 === 'hardware' } : {}),
    ...(!h264Known && h264.definitive ? { h264Profile: h264.profile } : {}),
  };
  if (typeof next.av1 === 'boolean' || 'h264Profile' in next) {
    hardwareEncoderCache.set(key, next);
  }
  return {
    av1: av1 === 'hardware',
    h264: h264.profile != null,
    h264Profile: h264.profile,
  };
}

export async function resolveDefaultVideoCodec(input: {
  available: readonly TStreamVideoCodec[];
  height: number;
  fps: number;
  bitrateKbps: number;
  sourceWidth?: number;
}): Promise<{
  codec: TStreamVideoCodec;
  hardwareCodec: 'av1' | 'h264' | null;
}> {
  const hardware = await detectHardwareEncoders(
    hardwareEncoderProbe({
      height: input.height,
      fps: input.fps,
      bitrateKbps: input.bitrateKbps,
      sourceWidth: input.sourceWidth,
    }),
  );
  const codec = pickDefaultVideoCodec({
    available: input.available,
    hardware,
  });
  let hardwareCodec: 'av1' | 'h264' | null = null;
  if (codec === 'av1' && hardware.av1) {
    hardwareCodec = 'av1';
  } else if (codec === 'h264' && hardware.h264) {
    hardwareCodec = 'h264';
  }
  return { codec, hardwareCodec };
}
