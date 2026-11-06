import { Injectable, computed, inject, signal } from '@angular/core';
import { TStreamVideoCodec } from '@konvoez/shared';
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
  codec?: TStreamVideoCodec;
  codecBlocked?: boolean;
};

export type TAnnouncedVideoCodec = {
  userId: number;
  tag: 'cam' | 'screen';
  codec: TStreamVideoCodec;
};

type TCamOffer = {
  producerId: string;
  codec?: TStreamVideoCodec;
  blocked: boolean;
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

  private readonly _camOffers =
    signal<Readonly<TPeerIdRecord<TCamOffer>>>(emptyPeerRecord());

  private readonly _watching = signal<ReadonlySet<number>>(new Set());

  public readonly availableScreens = this._availableScreens.asReadonly();
  public readonly watchingUserIds = this._watching.asReadonly();

  public readonly blockedCamUserIds = computed(() => {
    const ids = new Set<number>();
    for (const [userId, offer] of Object.entries(this._camOffers())) {
      if (offer.blocked) {
        ids.add(Number(userId));
      }
    }
    return ids;
  });

  public readonly blockedScreenUserIds = computed(() => {
    const ids = new Set<number>();
    for (const [userId, screen] of Object.entries(this._availableScreens())) {
      if (screen.codecBlocked) {
        ids.add(Number(userId));
      }
    }
    return ids;
  });

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
    codec?: TStreamVideoCodec,
  ): void {
    const prev = this._availableScreens();
    const existing = prev[userId] ?? { videoProducerId: '' };
    if (kind === 'video') {
      const sameProducer =
        existing.videoProducerId !== '' &&
        existing.videoProducerId === producerId;
      const nextCodec = codec ?? (sameProducer ? existing.codec : undefined);
      const next: TAvailableScreenShare = {
        videoProducerId: producerId,
      };
      if (existing.audioProducerId) {
        next.audioProducerId = existing.audioProducerId;
      }
      if (nextCodec) {
        next.codec = nextCodec;
      }
      if (sameProducer && existing.codecBlocked) {
        next.codecBlocked = true;
      }
      this._availableScreens.set({
        ...prev,
        [userId]: next,
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

  public registerCamOffer(
    userId: number,
    producerId: string,
    codec?: TStreamVideoCodec,
  ): void {
    const prev = this._camOffers();
    const existing = prev[userId];
    const sameProducer = existing?.producerId === producerId;
    const next: TCamOffer = {
      producerId,
      blocked: sameProducer ? (existing?.blocked ?? false) : false,
    };
    const nextCodec = codec ?? (sameProducer ? existing?.codec : undefined);
    if (nextCodec) {
      next.codec = nextCodec;
    }
    this._camOffers.set({
      ...prev,
      [userId]: next,
    });
  }

  public isCodecBlocked(userId: number, tag: 'cam' | 'screen'): boolean {
    if (tag === 'cam') {
      return this._camOffers()[userId]?.blocked ?? false;
    }
    return this._availableScreens()[userId]?.codecBlocked ?? false;
  }

  public setCodecBlocked(
    userId: number,
    tag: 'cam' | 'screen',
    blocked: boolean,
  ): void {
    if (tag === 'cam') {
      const offer = this._camOffers()[userId];
      if (!offer || offer.blocked === blocked) {
        return;
      }
      this._camOffers.set({
        ...this._camOffers(),
        [userId]: { ...offer, blocked },
      });
      return;
    }
    const screen = this._availableScreens()[userId];
    if (!screen || Boolean(screen.codecBlocked) === blocked) {
      return;
    }
    const next: TAvailableScreenShare = { ...screen };
    if (blocked) {
      next.codecBlocked = true;
    } else {
      delete next.codecBlocked;
    }
    this._availableScreens.set({
      ...this._availableScreens(),
      [userId]: next,
    });
  }

  public announcedVideoCodecs(): TAnnouncedVideoCodec[] {
    const offers: TAnnouncedVideoCodec[] = [];
    for (const [userId, offer] of Object.entries(this._camOffers())) {
      if (offer.codec) {
        offers.push({ userId: Number(userId), tag: 'cam', codec: offer.codec });
      }
    }
    for (const [userId, screen] of Object.entries(this._availableScreens())) {
      if (screen.codec) {
        offers.push({
          userId: Number(userId),
          tag: 'screen',
          codec: screen.codec,
        });
      }
    }
    return offers;
  }

  public forgetCamOffer(userId: number, producerId: string): void {
    const offer = this._camOffers()[userId];
    if (!offer || offer.producerId !== producerId) {
      return;
    }
    this._camOffers.set(omitPeer(this._camOffers(), userId));
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
      const next: TAvailableScreenShare = {
        videoProducerId: existing.videoProducerId,
      };
      if (existing.codec) {
        next.codec = existing.codec;
      }
      if (existing.codecBlocked) {
        next.codecBlocked = true;
      }
      this._availableScreens.set({
        ...prev,
        [userId]: next,
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
    this._camOffers.set(omitPeer(this._camOffers(), userId));
    this.setWatching(userId, false);
  }

  public getConsumerIdByTrack(track: MediaStreamTrack): string | null {
    if (track === this._localCamTrack() || track === this._localScreenTrack()) {
      return null;
    }
    for (const record of [this._remoteCam(), this._remoteScreen()]) {
      for (const entry of Object.values(record)) {
        if (entry.track === track) {
          return entry.consumerId;
        }
      }
    }
    return null;
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
    this._camOffers.set(emptyPeerRecord());
    this._watching.set(new Set());
    this._localCamTrack.set(null);
    this._localScreenTrack.set(null);
  }
}
