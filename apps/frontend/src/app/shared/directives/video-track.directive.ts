import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Binds a video element to one `MediaStreamTrack`.
 * A null track clears `srcObject`. Phase 4 can pause from here without
 * copying this binding into each preview.
 */
@Directive({
  selector: 'video[appVideoTrack]',
})
export class VideoTrackDirective {
  private readonly el = inject<ElementRef<HTMLVideoElement>>(ElementRef);

  public readonly track = input<MediaStreamTrack | null>(null, {
    alias: 'appVideoTrack',
  });

  constructor() {
    effect(() => {
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
    });
  }
}
