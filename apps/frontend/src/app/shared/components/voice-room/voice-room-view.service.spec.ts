import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomViewService } from './voice-room-view.service';

describe('VoiceRoomViewService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VoiceRoomViewService],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens theatre for any tile, including voice without a stream', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2, null);
    expect(view.theatreFocus()).toEqual({ peerId: 2, stream: null });
    expect(view.theatreOpen()).toBe(true);

    view.openTheatre(1, 'screen');
    expect(view.theatreFocus()).toEqual({ peerId: 1, stream: 'screen' });
    expect(view.theatreFocusId()).toBe(1);
    expect(view.theatreFocusStream()).toBe('screen');
  });

  it('retargets focus without closing theatre', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2, 'screen');
    view.retargetTheatre(2, 'cam');
    expect(view.theatreOpen()).toBe(true);
    expect(view.theatreFocus()).toEqual({ peerId: 2, stream: 'cam' });
  });

  it('closes theatre on Escape when not fullscreen', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2, 'screen');
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(view.theatreOpen()).toBe(false);
  });

  it('fullscreens the attached host without closing theatre', async () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2, 'screen');
    const host = document.createElement('div');
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    host.requestFullscreen = requestFullscreen;
    view.attachHost(host);

    await view.toggleFullscreen();

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(view.theatreOpen()).toBe(true);

    view.closeTheatre();
    expect(view.theatreOpen()).toBe(false);
  });

  it('does not exit fullscreen when closing theatre', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    view.openTheatre(2, 'screen');
    view.closeTheatre();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});
