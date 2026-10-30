import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerVideoService } from '@core/services/peer-video.service';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { VideoTrackDirective } from './video-track.directive';

@Component({
  imports: [VideoTrackDirective],
  template: `<video
    [appVideoTrack]="track()"
    muted
    playsinline></video>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class VideoTrackHost {
  public readonly track = signal<MediaStreamTrack | null>(null);
}

describe('VideoTrackDirective', () => {
  let getConsumerIdByTrack: ReturnType<typeof vi.fn>;
  let registerView: ReturnType<typeof vi.fn>;
  let dispose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    dispose = vi.fn();
    getConsumerIdByTrack = vi.fn().mockReturnValue(null);
    registerView = vi.fn().mockReturnValue(dispose);
    TestBed.configureTestingModule({
      providers: [
        { provide: PeerVideoService, useValue: { getConsumerIdByTrack } },
        { provide: RemoteVideoViewService, useValue: { registerView } },
      ],
    });
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('binds the track and clears it', () => {
    const fixture = TestBed.createComponent(VideoTrackHost);
    fixture.detectChanges();
    const video = fixture.nativeElement.querySelector(
      'video',
    ) as HTMLVideoElement;
    expect(video.srcObject).toBeNull();

    const track = { id: 'cam' } as MediaStreamTrack;
    fixture.componentInstance.track.set(track);
    fixture.detectChanges();
    TestBed.flushEffects();

    const stream = video.srcObject as MediaStream;
    expect(stream.getVideoTracks()[0]).toBe(track);
    expect(HTMLVideoElement.prototype.play).toHaveBeenCalled();

    fixture.componentInstance.track.set(null);
    fixture.detectChanges();
    TestBed.flushEffects();
    expect(video.srcObject).toBeNull();
    expect(registerView).not.toHaveBeenCalled();
  });

  it('registers a remote view and disposes it when the track clears', () => {
    getConsumerIdByTrack.mockReturnValue('c1');
    const fixture = TestBed.createComponent(VideoTrackHost);
    const track = { id: 'remote' } as MediaStreamTrack;
    fixture.componentInstance.track.set(track);
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(registerView).toHaveBeenCalledWith(
      'c1',
      expect.any(HTMLVideoElement),
    );

    fixture.componentInstance.track.set(null);
    fixture.detectChanges();
    TestBed.flushEffects();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
