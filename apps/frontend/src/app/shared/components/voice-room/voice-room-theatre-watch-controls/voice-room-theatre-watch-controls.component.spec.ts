import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { ConsumerRegistry } from '@core/services/consumer-registry';
import { PeerVideoService } from '@core/services/peer-video.service';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { VoiceRoomTheatreWatchControlsComponent } from './voice-room-theatre-watch-controls.component';

describe('VoiceRoomTheatreWatchControlsComponent', () => {
  let stopWatchingPeerScreen: ReturnType<typeof vi.fn>;
  let setPeerScreenGain: ReturnType<typeof vi.fn>;
  let setQuality: ReturnType<typeof vi.fn>;
  let layersById: ReturnType<
    typeof signal<Record<string, Array<{ height: number; fps: number }>>>
  >;
  let quality: ReturnType<
    typeof signal<'auto' | { height: number; fps: number }>
  >;
  let peerScreenGainLevels: ReturnType<typeof signal<Record<number, number>>>;

  beforeEach(() => {
    stopWatchingPeerScreen = vi.fn().mockResolvedValue(undefined);
    setPeerScreenGain = vi.fn();
    setQuality = vi.fn();
    layersById = signal({});
    quality = signal('auto');
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
          useValue: { layersById: layersById.asReadonly() },
        },
        {
          provide: PeerVideoService,
          useValue: {
            getScreenConsumerId: vi.fn(() => 'screen-4'),
          },
        },
        {
          provide: RemoteVideoViewService,
          useValue: {
            quality: quality.asReadonly(),
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

    layersById.set({
      'screen-4': [
        { height: 480, fps: 30 },
        { height: 1080, fps: 60 },
      ],
    });
    const fixture = create(4);
    const buttons = (
      fixture.nativeElement.querySelector('[tuiGroup]') as HTMLElement
    ).querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(
      fixture.componentInstance['qualityItems']().map((item) => item.label),
    ).toEqual(['1080p60', '480p30']);

    quality.set({ height: 1080, fps: 60 });
    fixture.detectChanges();
    expect(
      fixture.componentInstance['qualityItems']().find((item) => item.checked)
        ?.label,
    ).toBe('1080p60');

    fixture.componentInstance['onQualitySelect']({ height: 480, fps: 30 });
    expect(setQuality).toHaveBeenCalledWith({ height: 480, fps: 30 });
  });
});
