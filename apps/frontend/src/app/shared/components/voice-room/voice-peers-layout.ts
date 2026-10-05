import { IUser } from '@konvoez/shared';

/**
 * Split peers into streaming (cam and/or screen present) vs voice-only.
 * Streaming peers stay first (stable order within each group).
 */
export function partitionVoicePeers(
  peers: readonly IUser[],
  isStreaming: (userId: number) => boolean,
): { streaming: IUser[]; voiceOnly: IUser[] } {
  const streaming: IUser[] = [];
  const voiceOnly: IUser[] = [];
  for (const peer of peers) {
    if (isStreaming(peer.id)) {
      streaming.push(peer);
    } else {
      voiceOnly.push(peer);
    }
  }
  return { streaming, voiceOnly };
}

export function voiceSectionGridClass(count: number): string {
  if (count <= 1) {
    return 'section-1';
  }
  if (count === 2) {
    return 'section-2';
  }
  if (count <= 4) {
    return 'section-4';
  }
  return 'section-many';
}

/**
 * Prefer right strip when the container is wider than the stream
 * (extra horizontal space). Otherwise bottom strip.
 */
export function preferTheatreStripRight(
  containerWidth: number,
  containerHeight: number,
  streamWidth: number,
  streamHeight: number,
): boolean {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return false;
  }
  const streamAspect =
    streamWidth > 0 && streamHeight > 0 ? streamWidth / streamHeight : 16 / 9;
  const containerAspect = containerWidth / containerHeight;
  return containerAspect > streamAspect * 1.05;
}
