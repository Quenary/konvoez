import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { PeerVideoService } from '@core/services/peer-video.service';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';

/**
 * Binds a video element to one `MediaStreamTrack`.
 * A null track clears `srcObject`. Remote tracks register the element so
 * viewer quality and pause can follow this tile.
 */
@Directive({
  selector: 'video[appVideoTrack]',
})
export class VideoTrackDirective {
  private readonly el = inject<ElementRef<HTMLVideoElement>>(ElementRef);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly remoteVideoViewService = inject(RemoteVideoViewService);

  public readonly track = input<MediaStreamTrack | null>(null, {
    alias: 'appVideoTrack',
  });

  constructor() {
    effect((onCleanup) => {
      const track = this.track();
      const video = this.el.nativeElement;
      if (!track) {
        video.srcObject = null;
        return;
      }

      const current = video.srcObject;
      if (
        !(current instanceof MediaStream) ||
        current.getVideoTracks()[0] !== track
      ) {
        video.srcObject = new MediaStream([track]);
      }
      void video.play()?.catch(() => undefined);

      const lookup = this.peerVideoService.getConsumerIdByTrack;
      if (typeof lookup !== 'function') {
        return;
      }
      const consumerId = lookup.call(this.peerVideoService, track);
      if (!consumerId) {
        return;
      }
      onCleanup(this.remoteVideoViewService.registerView(consumerId, video));
    });
  }
}
