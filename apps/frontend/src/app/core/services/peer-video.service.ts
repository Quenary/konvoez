import { Injectable, computed, signal } from '@angular/core';
import type { Consumer } from 'mediasoup-client/types';

type TRemoteVideo = {
  producerId: string;
  track: MediaStreamTrack;
  consumer: Consumer;
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
 * Local tile uses cam only; local screen is shown in a floating PiP.
 * Remote display prefers screen over cam when watching.
 */
@Injectable({ providedIn: 'root' })
export class PeerVideoService {
  private readonly _localCamTrack = signal<MediaStreamTrack | null>(null);
  private readonly _localScreenTrack = signal<MediaStreamTrack | null>(null);
  public readonly localCamTrack = this._localCamTrack.asReadonly();
  public readonly localScreenTrack = this._localScreenTrack.asReadonly();
  /** Local tile / self-view: camera only (screen goes to PiP). */
  public readonly localTrack = computed(() => this._localCamTrack());

  private readonly _remoteCam =
    signal<Readonly<TPeerIdRecord<TRemoteVideo>>>(emptyPeerRecord());
  private readonly _remoteScreen =
    signal<Readonly<TPeerIdRecord<TRemoteVideo>>>(emptyPeerRecord());

  private readonly _availableScreens =
    signal<Readonly<TPeerIdRecord<TAvailableScreenShare>>>(emptyPeerRecord());

  private readonly _watching = signal<ReadonlySet<number>>(new Set());

  public readonly availableScreens = this._availableScreens.asReadonly();
  public readonly watchingUserIds = this._watching.asReadonly();

  /** Display track per remote user: screen if watching, else cam. */
  public readonly remoteTracks = computed(() => {
    const byUserId: TPeerIdRecord<MediaStreamTrack> = {};
    for (const [userId, entry] of Object.entries(this._remoteScreen())) {
      byUserId[Number(userId)] = entry.track;
    }
    for (const [userId, entry] of Object.entries(this._remoteCam())) {
      const id = Number(userId);
      if (byUserId[id] === undefined) {
        byUserId[id] = entry.track;
      }
    }
    return byUserId;
  });

  public setLocalCamTrack(track: MediaStreamTrack | null): void {
    this._localCamTrack.set(track);
  }

  /** @deprecated use setLocalCamTrack */
  public setLocalTrack(track: MediaStreamTrack | null): void {
    this.setLocalCamTrack(track);
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
    if (!existing.videoProducerId) {
      // audio-only announcement before video is unusual; keep placeholder
      this._availableScreens.set({
        ...prev,
        [userId]: {
          videoProducerId: existing.videoProducerId,
          audioProducerId: producerId,
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
    const next = new Set(this._watching());
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

  public hasAvailableScreen(userId: number): boolean {
    const available = this._availableScreens()[userId];
    return Boolean(available?.videoProducerId);
  }

  public attach(
    userId: number,
    consumer: Consumer,
    mediaTag: 'cam' | 'screen' = 'cam',
  ): void {
    const target = mediaTag === 'screen' ? this._remoteScreen : this._remoteCam;
    const previous = target()[userId];
    if (previous && previous.producerId !== consumer.producerId) {
      previous.consumer.close();
    }

    target.set({
      ...target(),
      [userId]: {
        producerId: consumer.producerId,
        track: consumer.track,
        consumer,
        mediaTag,
      },
    });

    if (mediaTag === 'screen') {
      this.setWatching(userId, true);
    }
  }

  public remove(userId: number, producerId: string): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      const entry = target()[userId];
      if (!entry || entry.producerId !== producerId) {
        continue;
      }
      if (!entry.consumer.closed) {
        entry.consumer.close();
      }
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
      if (!entry.consumer.closed) {
        entry.consumer.close();
      }
      target.set(omitPeer(target(), userId));
    }
    this._availableScreens.set(omitPeer(this._availableScreens(), userId));
    this.setWatching(userId, false);
  }

  public getScreenConsumerId(userId: number): string | null {
    return this._remoteScreen()[userId]?.consumer.id ?? null;
  }

  public removeByConsumerId(consumerId: string): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      for (const [userId, entry] of Object.entries(target())) {
        if (entry.consumer.id !== consumerId) {
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
      if (!entry.consumer.closed) {
        entry.consumer.close();
      }
      this._remoteScreen.set(omitPeer(this._remoteScreen(), userId));
    }
    this.setWatching(userId, false);
  }

  public trackFor(userId: number, isLocal: boolean): MediaStreamTrack | null {
    if (isLocal) {
      return this.localCamTrack();
    }
    return (
      this._remoteScreen()[userId]?.track ??
      this._remoteCam()[userId]?.track ??
      null
    );
  }

  public clear(): void {
    for (const record of [this._remoteCam(), this._remoteScreen()]) {
      for (const entry of Object.values(record)) {
        if (!entry.consumer.closed) {
          entry.consumer.close();
        }
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
