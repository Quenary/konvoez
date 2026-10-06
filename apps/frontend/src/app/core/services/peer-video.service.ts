import { Injectable, computed, signal } from '@angular/core';
import type { Consumer } from 'mediasoup-client/types';

type TRemoteVideo = {
  producerId: string;
  track: MediaStreamTrack;
  consumer: Consumer;
  mediaTag: 'cam' | 'screen';
};

/**
 * Remote/local video tracks for voice tiles (not Web Audio).
 */
@Injectable({ providedIn: 'root' })
export class PeerVideoService {
  private readonly _localTrack = signal<MediaStreamTrack | null>(null);
  public readonly localTrack = this._localTrack.asReadonly();

  private readonly _remote = signal<ReadonlyMap<number, TRemoteVideo>>(
    new Map(),
  );

  public readonly remoteTracks = computed(() => {
    const map = new Map<number, MediaStreamTrack>();
    for (const [userId, entry] of this._remote()) {
      map.set(userId, entry.track);
    }
    return map;
  });

  public setLocalTrack(track: MediaStreamTrack | null): void {
    this._localTrack.set(track);
  }

  public attach(
    userId: number,
    consumer: Consumer,
    mediaTag: 'cam' | 'screen' = 'cam',
  ): void {
    const previous = this._remote().get(userId);
    if (previous && previous.producerId !== consumer.producerId) {
      previous.consumer.close();
    }

    const next = new Map(this._remote());
    next.set(userId, {
      producerId: consumer.producerId,
      track: consumer.track,
      consumer,
      mediaTag,
    });
    this._remote.set(next);
  }

  public remove(userId: number, producerId: string): void {
    const entry = this._remote().get(userId);
    if (!entry || entry.producerId !== producerId) {
      return;
    }
    if (!entry.consumer.closed) {
      entry.consumer.close();
    }
    const next = new Map(this._remote());
    next.delete(userId);
    this._remote.set(next);
  }

  public removeUser(userId: number): void {
    const entry = this._remote().get(userId);
    if (!entry) {
      return;
    }
    if (!entry.consumer.closed) {
      entry.consumer.close();
    }
    const next = new Map(this._remote());
    next.delete(userId);
    this._remote.set(next);
  }

  public trackFor(userId: number, isLocal: boolean): MediaStreamTrack | null {
    if (isLocal) {
      return this._localTrack();
    }
    return this._remote().get(userId)?.track ?? null;
  }

  public clear(): void {
    for (const entry of this._remote().values()) {
      if (!entry.consumer.closed) {
        entry.consumer.close();
      }
    }
    this._remote.set(new Map());
    this._localTrack.set(null);
  }
}
