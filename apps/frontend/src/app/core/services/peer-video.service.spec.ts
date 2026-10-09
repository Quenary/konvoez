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
});
