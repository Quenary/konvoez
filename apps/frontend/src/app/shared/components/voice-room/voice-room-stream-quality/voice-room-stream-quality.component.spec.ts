import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { TViewerQualityMode } from '@core/services/remote-video-quality';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { VoiceRoomStreamQualityComponent } from './voice-room-stream-quality.component';

describe('VoiceRoomStreamQualityComponent', () => {
  it('sets the selected quality mode', () => {
    const quality = signal<TViewerQualityMode>('auto');
    const setQuality = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        {
          provide: RemoteVideoViewService,
          useValue: { quality: quality.asReadonly(), setQuality },
        },
      ],
    });
    const fixture = TestBed.createComponent(VoiceRoomStreamQualityComponent);
    fixture.detectChanges();
    fixture.componentInstance['select']('high');
    expect(setQuality).toHaveBeenCalledWith('high');
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
  });
});
