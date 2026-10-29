import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TuiRoot } from '@taiga-ui/core';
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
    TuiRoot,
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

  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly headerActions = input<TemplateRef<unknown> | null>(null);

  protected readonly fullscreenHost = computed(
    () => this.fullscreenRoot()?.nativeElement ?? null,
  );
  protected readonly participantsCount = this.voiceSessionPeersService.count;
  protected readonly layout = this.voiceRoomViewService.layout;

  private readonly fullscreenRoot = viewChild<TuiRoot, ElementRef<HTMLElement>>(
    'fullscreenRoot',
    { read: ElementRef },
  );
  private fullscreenElement: HTMLElement | null = null;

  constructor() {
    this.voiceRoomViewService.revealChrome();
    afterNextRender(() => {
      this.fullscreenElement = this.fullscreenHost();
    });
    this.destroyRef.onDestroy(() => {
      const element = this.fullscreenHost() ?? this.fullscreenElement;
      if (element && document.fullscreenElement === element) {
        void document.exitFullscreen();
      }
    });
  }

  protected revealChrome(): void {
    this.voiceRoomViewService.revealChrome();
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
