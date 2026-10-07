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
import { VoiceRoomGridComponent } from '../voice-room-grid/voice-room-grid.component';
import { VoiceRoomOverlayComponent } from '../voice-room-overlay/voice-room-overlay.component';
import { VoiceSessionPeersService } from '../voice-session-peers.service';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceOverlaySlotDirective } from '../voice-overlay-slot.directive';
import { IRoom } from '@konvoez/shared';

@Component({
  selector: 'app-voice-room-shell',
  host: {
    '(pointermove)': 'revealChrome()',
    '(pointerdown)': 'revealChrome()',
  },
  imports: [
    VoiceRoomGridComponent,
    VoiceRoomOverlayComponent,
    VoiceOverlaySlotDirective,
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

  public readonly room = input<IRoom | null>(null);
  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly headerActions = input<TemplateRef<unknown> | null>(null);
  public readonly left = output<void>();

  protected readonly fullscreenHost = this.host.nativeElement;
  protected readonly participantsCount = this.voiceSessionPeersService.count;

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
}
