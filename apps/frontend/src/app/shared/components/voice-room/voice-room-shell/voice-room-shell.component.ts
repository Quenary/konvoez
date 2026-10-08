import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { VoiceRoomGridComponent } from '../voice-room-grid/voice-room-grid.component';
import { VoiceRoomTheatreComponent } from '../voice-room-theatre/voice-room-theatre.component';
import { VoiceRoomOverlayComponent } from '../voice-room-overlay/voice-room-overlay.component';
import { VoiceSessionPeersService } from '../voice-session-peers.service';
import { VoiceRoomViewService } from '../voice-room-view.service';
@Component({
  selector: 'app-voice-room-shell',
  host: {
    '(pointermove)': 'revealChrome()',
    '(pointerdown)': 'revealChrome()',
    '(document:keydown.escape)': 'onEscape($event)',
  },
  imports: [
    NgTemplateOutlet,
    VoiceRoomGridComponent,
    VoiceRoomTheatreComponent,
    VoiceRoomOverlayComponent,
  ],
  templateUrl: './voice-room-shell.component.html',
  styleUrl: './voice-room-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomShellComponent {
  private readonly voiceSessionPeersService = inject(VoiceSessionPeersService);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly headerActions = input<TemplateRef<unknown> | null>(null);
  public readonly left = output<void>();

  protected readonly fullscreenHost = this.host.nativeElement;
  protected readonly participantsCount = this.voiceSessionPeersService.count;
  protected readonly layout = this.voiceRoomViewService.layout;

  constructor() {
    this.voiceRoomViewService.revealChrome();
    this.destroyRef.onDestroy(() => {
      if (document.fullscreenElement === this.fullscreenHost) {
        void document.exitFullscreen();
      }
    });
  }

  protected revealChrome(): void {
    this.voiceRoomViewService.revealChrome();
  }

  protected onLeft(): void {
    this.left.emit();
  }

  protected onEscape(event: Event): void {
    if (this.layout() !== 'theatre' || document.fullscreenElement) {
      return;
    }
    const overlayOpen = document.querySelector(
      'tui-dialog, tui-dropdown, tui-sheet-dialog',
    );
    queueMicrotask(() => {
      if (
        event.defaultPrevented ||
        overlayOpen ||
        document.fullscreenElement ||
        this.layout() !== 'theatre'
      ) {
        return;
      }
      this.voiceRoomViewService.showGrid();
    });
  }
}
