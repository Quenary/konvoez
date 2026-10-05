import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { IUser } from '@konvoez/shared';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoicePeerTileMiniComponent } from './voice-peer-tile-mini.component';

const user = (id: number): IUser =>
  ({
    id,
    username: `u${id}`,
    fullname: `User ${id}`,
  }) as IUser;

describe('VoicePeerTileMiniComponent', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'MediaStream',
      class MediaStream {
        constructor(readonly tracks: readonly MediaStreamTrack[] = []) {}
        getVideoTracks() {
          return this.tracks;
        }
      },
    );
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [VoicePeerTileMiniComponent],
      providers: [
        provideTranslateService(),
        {
          provide: AudioActivityService,
          useValue: {
            speakingMap: signal({}).asReadonly(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows centered avatar when there is no video track', () => {
    const fixture = TestBed.createComponent(VoicePeerTileMiniComponent);
    fixture.componentRef.setInput('peer', user(1));
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.avatar-backdrop'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  it('shows video and corner avatar when a track is present', () => {
    const fixture = TestBed.createComponent(VoicePeerTileMiniComponent);
    fixture.componentRef.setInput('peer', user(2));
    fixture.componentRef.setInput('videoTrack', {
      id: 'v',
    } as MediaStreamTrack);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('video')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.corner-avatar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.avatar-backdrop')).toBeNull();
  });
});
