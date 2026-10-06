import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EVoiceSessionType, TVoiceSessionTarget } from '@konvoez/shared';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomViewService } from './voice-room-view.service';

describe('VoiceRoomViewService', () => {
  let activeSession: ReturnType<typeof signal<TVoiceSessionTarget | null>>;

  beforeEach(() => {
    activeSession = signal<TVoiceSessionTarget | null>({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    TestBed.configureTestingModule({
      providers: [
        VoiceRoomViewService,
        {
          provide: VoiceRoomStore,
          useValue: {
            activeSession: activeSession.asReadonly(),
          },
        },
      ],
    });
    TestBed.inject(VoiceRoomViewService);
    TestBed.flushEffects();
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
    expect(view.theatreOpen()).toBe(true);
  });

  it('fullscreens an explicit target without closing theatre', async () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2, 'screen');
    const host = document.createElement('div');
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    host.requestFullscreen = requestFullscreen;

    await view.toggleFullscreen(host);

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(view.theatreOpen()).toBe(true);

    view.closeTheatre();
    expect(view.theatreOpen()).toBe(false);
  });

  it('closes theatre when the voice session changes or ends', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2, 'screen');
    expect(view.theatreOpen()).toBe(true);

    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    TestBed.flushEffects();
    expect(view.theatreOpen()).toBe(true);

    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 4,
    });
    TestBed.flushEffects();
    expect(view.theatreOpen()).toBe(false);

    view.openTheatre(3, null);
    activeSession.set({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: 9,
    });
    TestBed.flushEffects();
    expect(view.theatreOpen()).toBe(false);

    view.openTheatre(3, 'cam');
    activeSession.set(null);
    TestBed.flushEffects();
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
