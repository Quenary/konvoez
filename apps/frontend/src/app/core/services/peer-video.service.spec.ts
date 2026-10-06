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

  it('stores local preview track', () => {
    const track = { id: 'local' } as MediaStreamTrack;
    service.setLocalTrack(track);
    expect(service.localTrack()).toBe(track);
    expect(service.trackFor(1, true)).toBe(track);
    service.setLocalTrack(null);
    expect(service.trackFor(1, true)).toBeNull();
  });

  it('attaches and removes remote video by producer id', () => {
    const close = vi.fn();
    const track = { id: 'remote' } as MediaStreamTrack;
    const consumer = {
      producerId: 'p1',
      track,
      closed: false,
      close,
    };
    service.attach(7, consumer as never, 'cam');
    expect(service.trackFor(7, false)).toBe(track);
    expect(service.remoteTracks().get(7)).toBe(track);

    service.remove(7, 'other');
    expect(service.trackFor(7, false)).toBe(track);

    service.remove(7, 'p1');
    expect(service.trackFor(7, false)).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('clears all remote and local tracks', () => {
    const close = vi.fn();
    service.setLocalTrack({ id: 'local' } as MediaStreamTrack);
    service.attach(3, {
      producerId: 'p2',
      track: { id: 'r' } as MediaStreamTrack,
      closed: false,
      close,
    } as never);
    service.clear();
    expect(service.localTrack()).toBeNull();
    expect(service.remoteTracks().size).toBe(0);
    expect(close).toHaveBeenCalled();
  });
});
