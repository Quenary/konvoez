import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceRoomTheatreWatchControlsComponent } from './voice-room-theatre-watch-controls.component';

describe('VoiceRoomTheatreWatchControlsComponent', () => {
  let stopWatchingPeerScreen: ReturnType<typeof vi.fn>;
  let setPeerScreenGain: ReturnType<typeof vi.fn>;
  let peerScreenGainLevels: ReturnType<typeof signal<Record<number, number>>>;

  beforeEach(() => {
    stopWatchingPeerScreen = vi.fn().mockResolvedValue(undefined);
    setPeerScreenGain = vi.fn();
    peerScreenGainLevels = signal<Record<number, number>>({ 4: 0.5 });

    TestBed.configureTestingModule({
      imports: [VoiceRoomTheatreWatchControlsComponent],
      providers: [
        provideTranslateService(),
        {
          provide: VoiceRoomActionsService,
          useValue: { stopWatchingPeerScreen },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            peerScreenGainLevels: peerScreenGainLevels.asReadonly(),
            setPeerScreenGain,
          },
        },
      ],
    });
  });

  const create = (userId: number | null) => {
    const fixture = TestBed.createComponent(
      VoiceRoomTheatreWatchControlsComponent,
    );
    fixture.componentRef.setInput('userId', userId);
    fixture.detectChanges();
    return fixture;
  };

  it('stops watching the focused user', () => {
    const fixture = create(4);
    const stop = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    stop.click();
    expect(stopWatchingPeerScreen).toHaveBeenCalledWith(4);
  });

  it('does nothing when there is no focused user', () => {
    const fixture = create(null);
    expect(fixture.componentInstance['screenVolume']()).toBe(100);
    fixture.componentInstance['onStopWatch']();
    fixture.componentInstance['onScreenVolumeChange'](40);
    expect(stopWatchingPeerScreen).not.toHaveBeenCalled();
    expect(setPeerScreenGain).not.toHaveBeenCalled();
  });

  it('writes screen volume for the focused user', () => {
    const fixture = create(4);
    expect(fixture.componentInstance['screenVolume']()).toBe(50);
    fixture.componentInstance['onScreenVolumeChange'](80);
    expect(setPeerScreenGain).toHaveBeenCalledWith(4, 0.8);
  });
});
