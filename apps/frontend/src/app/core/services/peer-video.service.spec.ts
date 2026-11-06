import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsumerRegistry } from './consumer-registry';
import { PeerVideoService } from './peer-video.service';

describe('PeerVideoService', () => {
  let service: PeerVideoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PeerVideoService],
    });
    service = TestBed.inject(PeerVideoService);
  });

  it('keeps local cam and screen tracks separate', () => {
    const cam = { id: 'cam' } as MediaStreamTrack;
    const screen = { id: 'screen' } as MediaStreamTrack;
    service.setLocalCamTrack(cam);
    expect(service.localCamTrack()).toBe(cam);
    service.setLocalScreenTrack(screen);
    expect(service.localCamTrack()).toBe(cam);
    expect(service.localScreenTrack()).toBe(screen);
    expect(service.getConsumerIdByTrack(cam)).toBeNull();
  });

  it('resolves a remote track to its consumer id', () => {
    const track = { id: 'remote' } as MediaStreamTrack;
    service.attach(4, {
      producerId: 'p1',
      consumerId: 'c-remote',
      track,
      mediaTag: 'screen',
    });
    expect(service.getConsumerIdByTrack(track)).toBe('c-remote');
  });

  it('exposes cam and screen remote tracks separately', () => {
    const camTrack = { id: 'cam' } as MediaStreamTrack;
    const screenTrack = { id: 'screen' } as MediaStreamTrack;
    service.attach(7, {
      producerId: 'cam1',
      consumerId: 'c-cam',
      track: camTrack,
      mediaTag: 'cam',
    });
    expect(service.remoteCamTracks()[7]).toBe(camTrack);
    expect(service.remoteScreenTracks()[7]).toBeUndefined();

    service.registerAvailableScreen(7, 'scr1', 'video');
    service.registerAvailableScreen(7, 'aud1', 'audio');
    expect(service.availableScreens()[7]).toEqual({
      videoProducerId: 'scr1',
      audioProducerId: 'aud1',
    });

    service.attach(7, {
      producerId: 'scr1',
      consumerId: 'c-scr',
      track: screenTrack,
      mediaTag: 'screen',
    });
    expect(service.isWatching(7)).toBe(true);
    expect(service.remoteCamTracks()[7]).toBe(camTrack);
    expect(service.remoteScreenTracks()[7]).toBe(screenTrack);
  });

  it('clears watching when screen producer is unregistered', () => {
    service.registerAvailableScreen(3, 'p1', 'video');
    service.setWatching(3, true);
    service.unregisterAvailableScreenProducer(3, 'p1');
    expect(service.availableScreens()[3]).toBeUndefined();
    expect(service.isWatching(3)).toBe(false);
  });

  it('removes the whole screen entry when the video producer closes', () => {
    service.registerAvailableScreen(3, 'vid', 'video');
    service.registerAvailableScreen(3, 'aud', 'audio');
    service.setWatching(3, true);

    service.unregisterAvailableScreenProducer(3, 'vid');

    expect(service.availableScreens()[3]).toBeUndefined();
    expect(service.isWatching(3)).toBe(false);
  });

  it('drops screen-audio from availability when its producer closes', () => {
    service.registerAvailableScreen(3, 'vid', 'video');
    service.registerAvailableScreen(3, 'aud', 'audio');

    service.unregisterAvailableScreenProducer(3, 'aud');

    expect(service.availableScreens()[3]).toEqual({
      videoProducerId: 'vid',
    });
  });

  it('keeps the screen codec when screen-audio closes', () => {
    service.registerAvailableScreen(3, 'vid', 'video', 'av1');
    service.registerAvailableScreen(3, 'aud', 'audio');
    service.setCodecBlocked(3, 'screen', true);

    service.unregisterAvailableScreenProducer(3, 'aud');

    expect(service.availableScreens()[3]).toEqual({
      videoProducerId: 'vid',
      codec: 'av1',
      codecBlocked: true,
    });
    expect(service.isCodecBlocked(3, 'screen')).toBe(true);
    expect(service.announcedVideoCodecs()).toEqual([
      { userId: 3, tag: 'screen', codec: 'av1' },
    ]);
  });

  it('drops the previous codec when a new screen producer has none', () => {
    service.registerAvailableScreen(3, 'vid-1', 'video', 'av1');
    service.registerAvailableScreen(3, 'aud', 'audio');
    service.setCodecBlocked(3, 'screen', true);

    service.registerAvailableScreen(3, 'vid-2', 'video');

    expect(service.availableScreens()[3]).toEqual({
      videoProducerId: 'vid-2',
      audioProducerId: 'aud',
    });
    expect(service.isCodecBlocked(3, 'screen')).toBe(false);
    expect(service.announcedVideoCodecs()).toEqual([]);

    service.registerAvailableScreen(3, 'vid-2', 'video', 'vp9');
    service.setCodecBlocked(3, 'screen', true);
    service.registerAvailableScreen(3, 'vid-2', 'video');
    expect(service.availableScreens()[3]).toEqual({
      videoProducerId: 'vid-2',
      audioProducerId: 'aud',
      codec: 'vp9',
      codecBlocked: true,
    });
  });

  it('closes a replaced video consumer through the registry', () => {
    const close = vi.fn();
    const registry = TestBed.inject(ConsumerRegistry);
    registry.add({
      id: 'c-old',
      closed: false,
      close,
    } as never);
    const track = { id: 'cam' } as MediaStreamTrack;
    service.attach(4, {
      producerId: 'old',
      consumerId: 'c-old',
      track,
      mediaTag: 'cam',
    });
    service.attach(4, {
      producerId: 'new',
      consumerId: 'c-new',
      track,
      mediaTag: 'cam',
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(registry.get('c-old')).toBeUndefined();
  });

  it('correctly identifies stream producers with isStreamProducer', () => {
    expect(service.isStreamProducer(10, 'prod1')).toBe(false);

    service.attach(10, {
      producerId: 'cam-prod',
      consumerId: 'c-cam',
      track: { id: 'cam' } as MediaStreamTrack,
      mediaTag: 'cam',
    });
    expect(service.isStreamProducer(10, 'cam-prod')).toBe(true);
    expect(service.isStreamProducer(10, 'other')).toBe(false);

    service.registerAvailableScreen(11, 'screen-vid', 'video');
    service.registerAvailableScreen(11, 'screen-aud', 'audio');
    expect(service.isStreamProducer(11, 'screen-vid')).toBe(true);
    expect(service.isStreamProducer(11, 'screen-aud')).toBe(false);
  });

  it('tracks a blocked camera and screen codec until the producer is gone', () => {
    service.registerCamOffer(4, 'cam-1', 'av1');
    service.registerAvailableScreen(4, 'screen-1', 'video', 'vp9');
    service.setCodecBlocked(4, 'cam', true);
    service.setCodecBlocked(4, 'screen', true);

    expect(service.isCodecBlocked(4, 'cam')).toBe(true);
    expect(service.isCodecBlocked(4, 'screen')).toBe(true);
    expect(service.blockedCamUserIds().has(4)).toBe(true);
    expect(service.blockedScreenUserIds().has(4)).toBe(true);
    expect(service.announcedVideoCodecs()).toEqual([
      { userId: 4, tag: 'cam', codec: 'av1' },
      { userId: 4, tag: 'screen', codec: 'vp9' },
    ]);

    service.forgetCamOffer(4, 'cam-1');
    service.unregisterAvailableScreenProducer(4, 'screen-1');
    expect(service.isCodecBlocked(4, 'cam')).toBe(false);
    expect(service.isCodecBlocked(4, 'screen')).toBe(false);
  });
});
