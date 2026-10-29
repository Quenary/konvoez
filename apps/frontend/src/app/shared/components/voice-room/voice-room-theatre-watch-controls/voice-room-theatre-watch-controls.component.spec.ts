import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { ConsumerRegistry } from '@core/services/consumer-registry';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { VoiceRoomTheatreWatchControlsComponent } from './voice-room-theatre-watch-controls.component';

describe('VoiceRoomTheatreWatchControlsComponent', () => {
  let stopWatchingPeerScreen: ReturnType<typeof vi.fn>;
  let setPeerScreenGain: ReturnType<typeof vi.fn>;
  let setQuality: ReturnType<typeof vi.fn>;
  let layered: ReturnType<typeof signal<boolean>>;
  let peerScreenGainLevels: ReturnType<typeof signal<Record<number, number>>>;

  beforeEach(() => {
    stopWatchingPeerScreen = vi.fn().mockResolvedValue(undefined);
    setPeerScreenGain = vi.fn();
    setQuality = vi.fn();
    layered = signal(false);
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
        {
          provide: ConsumerRegistry,
          useValue: { layered: layered.asReadonly() },
        },
        {
          provide: RemoteVideoViewService,
          useValue: {
            quality: signal('auto').asReadonly(),
            setQuality,
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

  it('shows quality selection to the right of screen volume only while a stream has layers', () => {
    const hidden = create(4);
    const hiddenGroup = hidden.nativeElement.querySelector(
      '[tuiGroup]',
    ) as HTMLElement;
    expect(hiddenGroup.querySelectorAll('button').length).toBe(2);

    layered.set(true);
    const fixture = create(4);
    const buttons = (
      fixture.nativeElement.querySelector('[tuiGroup]') as HTMLElement
    ).querySelectorAll('button');
    expect(buttons.length).toBe(3);

    fixture.componentInstance['onQualitySelect']('source');
    expect(setQuality).toHaveBeenCalledWith('source');
  });
});
