import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { IUser } from '@konvoez/shared';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceTheatreComponent } from './voice-theatre.component';

const peer = (id: number, username = `u${id}`): IUser =>
  ({ id, username }) as IUser;

describe('VoiceTheatreComponent', () => {
  const peerScreenGainLevels = signal<Record<number, number>>({});

  beforeEach(() => {
    peerScreenGainLevels.set({});
    vi.stubGlobal(
      'MediaStream',
      class MediaStream {
        constructor(readonly tracks: readonly MediaStreamTrack[] = []) {}
        getVideoTracks() {
          return this.tracks;
        }
      },
    );
    TestBed.configureTestingModule({
      imports: [VoiceTheatreComponent],
      providers: [
        provideTranslateService(),
        {
          provide: VoiceRoomStore,
          useValue: {
            peerScreenGainLevels: peerScreenGainLevels.asReadonly(),
            setPeerScreenGain: vi.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const create = (
    overrides: Partial<{
      focusPeer: IUser;
      watchingByPeerId: Readonly<Record<number, boolean>>;
    }> = {},
  ) => {
    const fixture = TestBed.createComponent(VoiceTheatreComponent);
    fixture.componentRef.setInput('focusPeer', overrides.focusPeer ?? peer(2));
    fixture.componentRef.setInput('stripPeers', [peer(1), peer(2), peer(3)]);
    fixture.componentRef.setInput(
      'watchingByPeerId',
      overrides.watchingByPeerId ?? { 2: true, 3: true },
    );
    fixture.componentRef.setInput('screenLiveByPeerId', { 2: true });
    fixture.detectChanges();
    return fixture;
  };

  it('reveals overlay on touchstart on stage', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    expect(cmp['overlayVisible']()).toBe(false);

    const stage = fixture.nativeElement.querySelector('.stage') as HTMLElement;
    stage.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    expect(cmp['overlayVisible']()).toBe(true);
  });

  it('reveals overlay on stage click (tap)', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    const stage = fixture.nativeElement.querySelector('.stage') as HTMLElement;
    stage.click();
    expect(cmp['overlayVisible']()).toBe(true);
  });

  it('hides overlay again after the reveal timeout', () => {
    vi.useFakeTimers();
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['revealOverlay']();
    expect(cmp['overlayVisible']()).toBe(true);

    vi.advanceTimersByTime(2500);
    expect(cmp['overlayVisible']()).toBe(false);
  });

  it('emits closeTheatre on Escape when not fullscreen', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    const closeSpy = vi.fn();
    cmp.closeTheatre.subscribe(closeSpy);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('emits focusPeerId when selecting another watching peer in the strip', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    const focusSpy = vi.fn();
    cmp.focusPeerId.subscribe(focusSpy);

    cmp['onStripPeerClick'](3);
    expect(focusSpy).toHaveBeenCalledWith(3);
  });
});
