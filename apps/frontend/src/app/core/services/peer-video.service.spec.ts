import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerVideoService } from './peer-video.service';

describe('PeerVideoService', () => {
  let service: PeerVideoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PeerVideoService],
    });
    service = TestBed.inject(PeerVideoService);
  });

  it('prefers local screen track over cam for display', () => {
    const cam = { id: 'cam' } as MediaStreamTrack;
    const screen = { id: 'screen' } as MediaStreamTrack;
    service.setLocalCamTrack(cam);
    expect(service.localTrack()).toBe(cam);
    service.setLocalScreenTrack(screen);
    expect(service.localTrack()).toBe(screen);
  });

  it('registers available screen and prefers screen when watching', () => {
    const close = vi.fn();
    const camTrack = { id: 'cam' } as MediaStreamTrack;
    const screenTrack = { id: 'screen' } as MediaStreamTrack;
    service.attach(
      7,
      {
        producerId: 'cam1',
        track: camTrack,
        closed: false,
        close,
      } as never,
      'cam',
    );
    expect(service.remoteTracks().get(7)).toBe(camTrack);

    service.registerAvailableScreen(7, 'scr1', 'video');
    service.registerAvailableScreen(7, 'aud1', 'audio');
    expect(service.hasAvailableScreen(7)).toBe(true);
    expect(service.availableScreens().get(7)).toEqual({
      videoProducerId: 'scr1',
      audioProducerId: 'aud1',
    });

    service.attach(
      7,
      {
        producerId: 'scr1',
        track: screenTrack,
        closed: false,
        close,
        id: 'c-scr',
      } as never,
      'screen',
    );
    expect(service.isWatching(7)).toBe(true);
    expect(service.remoteTracks().get(7)).toBe(screenTrack);
  });

  it('clears watching when screen producer is unregistered', () => {
    service.registerAvailableScreen(3, 'p1', 'video');
    service.setWatching(3, true);
    service.unregisterAvailableScreenProducer(3, 'p1');
    expect(service.hasAvailableScreen(3)).toBe(false);
    expect(service.isWatching(3)).toBe(false);
  });
});
