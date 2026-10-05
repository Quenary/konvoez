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

  private readonly _remoteCam = signal<ReadonlyMap<number, TRemoteVideo>>(
    new Map(),
  );
  private readonly _remoteScreen = signal<ReadonlyMap<number, TRemoteVideo>>(
    new Map(),
  );

  private readonly _availableScreens = signal<
    ReadonlyMap<number, TAvailableScreenShare>
  >(new Map());

  private readonly _watching = signal<ReadonlySet<number>>(new Set());

  public readonly availableScreens = this._availableScreens.asReadonly();
  public readonly watchingUserIds = this._watching.asReadonly();

  /** Display track per remote user: screen if watching, else cam. */
  public readonly remoteTracks = computed(() => {
    const map = new Map<number, MediaStreamTrack>();
    for (const [userId, entry] of this._remoteScreen()) {
      map.set(userId, entry.track);
    }
    for (const [userId, entry] of this._remoteCam()) {
      if (!map.has(userId)) {
        map.set(userId, entry.track);
      }
    }
    return map;
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
    const next = new Map(this._availableScreens());
    const existing = next.get(userId) ?? { videoProducerId: '' };
    if (kind === 'video') {
      next.set(userId, {
        ...existing,
        videoProducerId: producerId,
      });
    } else {
      if (!existing.videoProducerId) {
        // audio-only announcement before video is unusual; keep placeholder
        next.set(userId, {
          videoProducerId: existing.videoProducerId,
          audioProducerId: producerId,
        });
      } else {
        next.set(userId, {
          ...existing,
          audioProducerId: producerId,
        });
      }
    }
    this._availableScreens.set(next);
  }

  public unregisterAvailableScreenProducer(
    userId: number,
    producerId: string,
  ): void {
    const existing = this._availableScreens().get(userId);
    if (!existing) {
      return;
    }
    const next = new Map(this._availableScreens());
    if (existing.videoProducerId === producerId) {
      next.delete(userId);
      this.setWatching(userId, false);
    } else if (existing.audioProducerId === producerId) {
      next.set(userId, { videoProducerId: existing.videoProducerId });
    } else {
      return;
    }
    this._availableScreens.set(next);
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
    const available = this._availableScreens().get(userId);
    return Boolean(available?.videoProducerId);
  }

  public attach(
    userId: number,
    consumer: Consumer,
    mediaTag: 'cam' | 'screen' = 'cam',
  ): void {
    const target = mediaTag === 'screen' ? this._remoteScreen : this._remoteCam;
    const previous = target().get(userId);
    if (previous && previous.producerId !== consumer.producerId) {
      previous.consumer.close();
    }

    const next = new Map(target());
    next.set(userId, {
      producerId: consumer.producerId,
      track: consumer.track,
      consumer,
      mediaTag,
    });
    target.set(next);

    if (mediaTag === 'screen') {
      this.setWatching(userId, true);
    }
  }

  public remove(userId: number, producerId: string): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      const entry = target().get(userId);
      if (!entry || entry.producerId !== producerId) {
        continue;
      }
      if (!entry.consumer.closed) {
        entry.consumer.close();
      }
      const next = new Map(target());
      next.delete(userId);
      target.set(next);
      if (entry.mediaTag === 'screen') {
        this.setWatching(userId, false);
      }
      return;
    }
  }

  public removeUser(userId: number): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      const entry = target().get(userId);
      if (!entry) {
        continue;
      }
      if (!entry.consumer.closed) {
        entry.consumer.close();
      }
      const next = new Map(target());
      next.delete(userId);
      target.set(next);
    }
    const available = new Map(this._availableScreens());
    available.delete(userId);
    this._availableScreens.set(available);
    this.setWatching(userId, false);
  }

  public getScreenConsumerId(userId: number): string | null {
    return this._remoteScreen().get(userId)?.consumer.id ?? null;
  }

  public removeByConsumerId(consumerId: string): void {
    for (const target of [this._remoteCam, this._remoteScreen] as const) {
      for (const [userId, entry] of target()) {
        if (entry.consumer.id !== consumerId) {
          continue;
        }
        this.remove(userId, entry.producerId);
        return;
      }
    }
  }

  public stopWatchingLocal(userId: number): void {
    const entry = this._remoteScreen().get(userId);
    if (entry) {
      if (!entry.consumer.closed) {
        entry.consumer.close();
      }
      const next = new Map(this._remoteScreen());
      next.delete(userId);
      this._remoteScreen.set(next);
    }
    this.setWatching(userId, false);
  }

  public trackFor(userId: number, isLocal: boolean): MediaStreamTrack | null {
    if (isLocal) {
      return this.localCamTrack();
    }
    return (
      this._remoteScreen().get(userId)?.track ??
      this._remoteCam().get(userId)?.track ??
      null
    );
  }

  public clear(): void {
    for (const map of [this._remoteCam(), this._remoteScreen()]) {
      for (const entry of map.values()) {
        if (!entry.consumer.closed) {
          entry.consumer.close();
        }
      }
    }
    this._remoteCam.set(new Map());
    this._remoteScreen.set(new Map());
    this._availableScreens.set(new Map());
    this._watching.set(new Set());
    this._localCamTrack.set(null);
    this._localScreenTrack.set(null);
  }
}
