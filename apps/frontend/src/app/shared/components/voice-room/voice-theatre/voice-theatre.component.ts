import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IUser } from '@konvoez/shared';
import { preferTheatreStripRight } from '../voice-peers-layout';
import { VoiceChromeReveal } from '../voice-chrome-reveal';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceTheatreActionsComponent } from '../voice-theatre-actions/voice-theatre-actions.component';

@Component({
  selector: 'app-voice-theatre',
  imports: [TranslatePipe, VoiceTheatreActionsComponent],
  templateUrl: './voice-theatre.component.html',
  styleUrl: './voice-theatre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceTheatreComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);

  public readonly focusPeer = input.required<IUser>();
  public readonly videoTrack = input<MediaStreamTrack | null>(null);
  public readonly stripPeers = input.required<readonly IUser[]>();
  public readonly watchingByPeerId =
    input.required<Readonly<Record<number, boolean>>>();
  public readonly screenLiveByPeerId =
    input.required<Readonly<Record<number, boolean>>>();
  public readonly showLocalChrome = input(false);

  private readonly stageEl = viewChild<ElementRef<HTMLElement>>('stageEl');
  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  protected readonly stripRight = signal(false);

  private readonly chrome = new VoiceChromeReveal(false);
  private streamWidth = 16;
  private streamHeight = 9;

  protected readonly overlayVisible = computed(() => {
    const showLocal = this.showLocalChrome();
    const local = this.chrome.visible();
    return showLocal && local;
  });

  constructor() {
    effect(() => {
      const el = this.videoEl()?.nativeElement;
      const track = this.videoTrack();
      if (!el) {
        return;
      }
      if (track) {
        const stream = el.srcObject;
        if (
          stream instanceof MediaStream &&
          stream.getVideoTracks()[0] === track
        ) {
          return;
        }
        el.srcObject = new MediaStream([track]);
        void el.play()?.catch(() => undefined);
      } else {
        el.srcObject = null;
      }
    });

    this.destroyRef.onDestroy(() => {
      this.chrome.destroy();
      if (this.showLocalChrome()) {
        this.voiceRoomViewService.setFullscreenRoot(null);
      }
    });

    effect(() => {
      const showLocal = this.showLocalChrome();
      const stage = this.stageEl()?.nativeElement ?? null;
      if (!showLocal) {
        return;
      }
      this.voiceRoomViewService.setFullscreenRoot(stage);
    });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.updateStripPlacement());
      ro.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
    }
  }

  protected onVideoMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      this.streamWidth = video.videoWidth;
      this.streamHeight = video.videoHeight;
      this.updateStripPlacement();
    }
  }

  protected revealOverlay(): void {
    const showLocal = this.showLocalChrome();
    if (!showLocal) {
      this.voiceRoomViewService.revealChrome();
      return;
    }
    this.chrome.reveal();
  }

  protected onStageActivate(): void {
    this.revealOverlay();
  }

  protected onStripPeerClick(peerId: number): void {
    if (peerId === this.focusPeer().id) {
      return;
    }
    this.voiceRoomViewService.openTheatre(peerId);
  }

  private updateStripPlacement(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.stripRight.set(
      preferTheatreStripRight(
        rect.width,
        rect.height,
        this.streamWidth,
        this.streamHeight,
      ),
    );
  }
}
