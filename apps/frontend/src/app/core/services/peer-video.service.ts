import { Injectable, computed, inject, signal } from '@angular/core';
import { ConsumerRegistry } from './consumer-registry';

type TRemoteVideo = {
  producerId: string;
  consumerId: string;
  track: MediaStreamTrack;
  mediaTag: 'cam' | 'screen';
};

export type TRemoteVideoAttach = {
  producerId: string;
  consumerId: string;
  track: MediaStreamTrack;
  mediaTag: 'cam' | 'screen';
};

export type TAvailableScreenShare = {
  videoProducerId: string;
  audioProducerId?: string;
};

type TPeerIdRecord<T> = Record<number, T>;

const emptyPeerRecord = <T>(): TPeerIdRecord<T> => ({});

const omitPeer = <T>(
  record: Readonly<TPeerIdRecord<T>>,
  userId: number,
): TPeerIdRecord<T> => {
  const { [userId]: _removed, ...rest } = record;
  return rest;
};

/**
 * Remote/local video tracks for voice tiles (not Web Audio).
 * Cam and screen are separate sources; UI builds one or two tiles per peer.
 */
@Injectable({ providedIn: 'root' })
export class PeerVideoService {
  private readonly consumerRegistry = inject(ConsumerRegistry);

  private readonly _localCamTrack = signal<MediaStreamTrack | null>(null);
  private readonly _localScreenTrack = signal<MediaStreamTrack | null>(null);
  public readonly localCamTrack = this._localCamTrack.asReadonly();
  public readonly localScreenTrack = this._localScreenTrack.asReadonly();

  private readonly _remoteCam =
    signal<Readonly<TPeerIdRecord<TRemoteVideo>>>(emptyPeerRecord());
  private readonly _remoteScreen =
    signal<Readonly<TPeerIdRecord<TRemoteVideo>>>(emptyPeerRecord());

  private readonly _availableScreens =
    signal<Readonly<TPeerIdRecord<TAvailableScreenShare>>>(emptyPeerRecord());

  private readonly _watching = signal<ReadonlySet<number>>(new Set());

  public readonly availableScreens = this._availableScreens.asReadonly();
  public readonly watchingUserIds = this._watching.asReadonly();

  public readonly remoteCamTracks = computed(() => {
    const byUserId: TPeerIdRecord<MediaStreamTrack> = {};
    for (const [userId, entry] of Object.entries(this._remoteCam())) {
      byUserId[Number(userId)] = entry.track;
    }
    return byUserId;
  });

  public readonly remoteScreenTracks = computed(() => {
    const byUserId: TPeerIdRecord<MediaStreamTrack> = {};
    for (const [userId, entry] of Object.entries(this._remoteScreen())) {
      byUserId[Number(userId)] = entry.track;
    }
    return byUserId;
  });

  public setLocalCamTrack(track: MediaStreamTrack | null): void {
    this._localCamTrack.set(track);
  }

  public setLocalScreenTrack(track: MediaStreamTrack | null): void {
    this._localScreenTrack.set(track);
  }

  public registerAvailableScreen(
    userId: number,
    producerId: string,
    kind: 'video' | 'audio',
  ): void {
    const prev = this._availableScreens();
    const existing = prev[userId] ?? { videoProducerId: '' };
    if (kind === 'video') {
      this._availableScreens.set({
        ...prev,
        [userId]: {
          ...existing,
          videoProducerId: producerId,
        },
      });
      return;
    }
    this._availableScreens.set({
      ...prev,
      [userId]: {
        ...existing,
        audioProducerId: producerId,
      },
    });
  }

  public unregisterAvailableScreenProducer(
    userId: number,
    producerId: string,
  ): void {
    const existing = this._availableScreens()[userId];
    if (!existing) {
      return;
    }
    const prev = this._availableScreens();
    if (existing.videoProducerId === producerId) {
      this._availableScreens.set(omitPeer(prev, userId));
      this.setWatching(userId, false);
    } else if (existing.audioProducerId === producerId) {
      this._availableScreens.set({
        ...prev,
        [userId]: { videoProducerId: existing.videoProducerId },
      });
    }
  }

  public setWatching(userId: number, watching: boolean): void {
    const current = this._watching();
    if (current.has(userId) === watching) {
      return;
    }
    const next = new Set(current);
    if (watching) {
      next.add(userId);
    } else {
      next.delete(userId);
    }
    this._watching.set(next);
  }

  public isWatching(userId: number): boolean {
    return this._watching().has(userId);
  }

  public isStreamProducer(userId: number, producerId: string): boolean {
    const cam = this._remoteCam()[userId];
    if (cam && cam.producerId === producerId) {
      return true;
    }
    const screen = this._remoteScreen()[userId];
    if (screen && screen.producerId === producerId) {
      return true;
    }
    const available = this._availableScreens()[userId];
    if (available && available.videoProducerId === producerId) {
      return true;
    }
    return false;
  }

  public attach(userId: number, entry: TRemoteVideoAttach): void {
    const target =
      entry.mediaTag === 'screen' ? this._remoteScreen : this._remoteCam;
    const previous = target()[userId];
    if (previous && previous.producerId !== entry.producerId) {
      this.consumerRegistry.close(previous.consumerId);
    }

    target.set({
      ...target(),
      [userId]: entry,
    });

    if (entry.mediaTag === 'screen') {
      this.setWatching(userId, true);
    }
  }

  public remove(userId: number, producerId: string): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      const entry = target()[userId];
      if (!entry || entry.producerId !== producerId) {
        continue;
      }
      this.consumerRegistry.close(entry.consumerId);
      target.set(omitPeer(target(), userId));
      if (entry.mediaTag === 'screen') {
        this.setWatching(userId, false);
      }
      return;
    }
  }

  public removeUser(userId: number): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      const entry = target()[userId];
      if (!entry) {
        continue;
      }
      this.consumerRegistry.close(entry.consumerId);
      target.set(omitPeer(target(), userId));
    }
    this._availableScreens.set(omitPeer(this._availableScreens(), userId));
    this.setWatching(userId, false);
  }

  public getScreenConsumerId(userId: number): string | null {
    return this._remoteScreen()[userId]?.consumerId ?? null;
  }

  public removeByConsumerId(consumerId: string): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      for (const [userId, entry] of Object.entries(target())) {
        if (entry.consumerId !== consumerId) {
          continue;
        }
        this.remove(Number(userId), entry.producerId);
        return;
      }
    }
  }

  public stopWatchingLocal(userId: number): void {
    const entry = this._remoteScreen()[userId];
    if (entry) {
      this.consumerRegistry.close(entry.consumerId);
      this._remoteScreen.set(omitPeer(this._remoteScreen(), userId));
    }
    this.setWatching(userId, false);
  }

  public clear(): void {
    for (const record of [this._remoteCam(), this._remoteScreen()]) {
      for (const entry of Object.values(record)) {
        this.consumerRegistry.close(entry.consumerId);
      }
    }
    this._remoteCam.set(emptyPeerRecord());
    this._remoteScreen.set(emptyPeerRecord());
    this._availableScreens.set(emptyPeerRecord());
    this._watching.set(new Set());
    this._localCamTrack.set(null);
    this._localScreenTrack.set(null);
  }
}
