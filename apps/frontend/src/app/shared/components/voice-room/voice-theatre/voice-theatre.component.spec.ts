import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { IUser } from '@konvoez/shared';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceTheatreComponent } from './voice-theatre.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VOICE_CHROME_HIDE_MS } from '../voice-chrome-reveal';

const peer = (id: number, username = `u${id}`): IUser =>
  ({ id, username }) as IUser;

describe('VoiceTheatreComponent', () => {
  let openTheatre: ReturnType<typeof vi.fn>;
  let revealChrome: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openTheatre = vi.fn();
    revealChrome = vi.fn();
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
            peerScreenGainLevels: signal({}).asReadonly(),
            setPeerScreenGain: vi.fn(),
          },
        },
        {
          provide: VoiceRoomViewService,
          useValue: {
            chromeVisible: signal(true).asReadonly(),
            theatreFocusId: signal<number | null>(2).asReadonly(),
            theatreOpen: signal(true).asReadonly(),
            isFullscreen: signal(false).asReadonly(),
            revealChrome,
            openTheatre,
            closeTheatre: vi.fn(),
            toggleFullscreen: vi.fn(),
            setFullscreenRoot: vi.fn(),
            stopWatchingFocus: vi.fn(),
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
      showLocalChrome: boolean;
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
    fixture.componentRef.setInput(
      'showLocalChrome',
      overrides.showLocalChrome ?? true,
    );
    fixture.detectChanges();
    return fixture;
  };

  it('reveals overlay on touchstart on stage when local chrome is on', () => {
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

    vi.advanceTimersByTime(VOICE_CHROME_HIDE_MS);
    expect(cmp['overlayVisible']()).toBe(false);
  });

  it('forwards activity to the room view when local chrome is off', () => {
    const fixture = create({ showLocalChrome: false });
    const cmp = fixture.componentInstance;
    cmp['revealOverlay']();
    expect(revealChrome).toHaveBeenCalled();
    expect(cmp['overlayVisible']()).toBe(false);
  });

  it('opens another watching peer from the strip via the view service', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['onStripPeerClick'](3);
    expect(openTheatre).toHaveBeenCalledWith(3);
  });
});
