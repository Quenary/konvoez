import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiDataList,
  TuiDropdown,
  TuiNotificationService,
  TuiOptGroup,
  TuiOption,
} from '@taiga-ui/core';
import { TuiDataListDropdownManager } from '@taiga-ui/kit';

import { icons } from '@constants';
import { EPermission, TVoiceRoomPeerUser } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { notifyError } from '@shared/functions/notify-error.function';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { VolumeControlComponent } from '../volume-control/volume-control.component';

export interface IUserContextMoveTarget {
  id: number;
  name: string;
}

@Component({
  selector: 'app-user-context-menu',
  imports: [
    TranslatePipe,
    TuiDataList,
    TuiDataListDropdownManager,
    TuiDropdown,
    TuiOptGroup,
    TuiOption,
    VolumeControlComponent,
  ],
  templateUrl: './user-context-menu.component.html',
  styleUrl: './user-context-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserContextMenuComponent {
  private readonly store = inject(Store);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly roomsStore = inject(RoomsStore);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly userDialogService = inject(UserDialogService);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  public readonly peer = input.required<TVoiceRoomPeerUser>();
  public readonly roomId = input<number | null>(null);

  public readonly closeMenu = output<void>();

  protected readonly icons = icons;

  protected readonly effectiveRoomId = computed(() => {
    const explicit = this.roomId();
    const current = this.voiceSessionStore.selectedRoomId();
    return explicit ?? current;
  });

  protected readonly isSelf = computed(() => {
    const current = this.currentUser();
    const peer = this.peer();
    return Boolean(current && peer && current.id === peer.id);
  });

  protected readonly showVolume = computed(() => {
    const peer = this.peer();
    const self = this.isSelf();
    return Boolean(peer && !self);
  });

  protected readonly volume = computed(() => {
    const peer = this.peer();
    const levels = this.voiceAudioPreferencesStore.peerGainLevels();
    if (!peer) {
      return 100;
    }
    return Math.round((levels[peer.id] ?? 1) * 100);
  });

  protected readonly volumeIcon = computed(() => {
    const volume = this.volume();
    if (volume === 0) {
      return '@tui.volume-off';
    }
    if (volume < 50) {
      return '@tui.volume-1';
    }
    return '@tui.volume-2';
  });

  protected readonly canModerate = computed(() => {
    const me = this.currentUser();
    const peer = this.peer();
    const roomId = this.effectiveRoomId();
    const allowed = Boolean(
      me?.isOwner || me?.permissions?.includes(EPermission.MOVE_MEMBERS),
    );
    return (
      roomId !== null && allowed && (!peer.isOwner || Boolean(me?.isOwner))
    );
  });

  protected readonly moveTargets = computed<IUserContextMoveTarget[]>(() => {
    const roomId = this.effectiveRoomId();
    const rooms = this.roomsStore.voiceRooms();
    const canModerate = this.canModerate();
    if (!canModerate || roomId === null) {
      return [];
    }
    return rooms
      .filter((room) => room.id !== roomId)
      .map((room) => ({ id: room.id, name: room.name }));
  });

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected onOpenDetails(): void {
    void this.userDialogService.open(this.peer(), {
      withFiles: false,
      withInput: true,
    });
    this.closeMenu.emit();
  }

  protected async onMoveMember(target: IUserContextMoveTarget): Promise<void> {
    try {
      await this.voiceSessionService.moveMember(this.peer().id, target.id);
    } catch (error: unknown) {
      notifyError(
        this.tuiNotificationService,
        this.translateService,
        'GENERAL.UNKNOWN_ERROR',
        error,
      );
    }
    this.closeMenu.emit();
  }

  protected async onDisconnectMember(): Promise<void> {
    const roomId = this.effectiveRoomId();
    if (roomId === null) {
      return;
    }
    try {
      await this.voiceSessionService.disconnectMember(this.peer().id, roomId);
    } catch (error: unknown) {
      notifyError(
        this.tuiNotificationService,
        this.translateService,
        'GENERAL.UNKNOWN_ERROR',
        error,
      );
    }
    this.closeMenu.emit();
  }

  protected onVolumeChange(value: number): void {
    this.voiceAudioPreferencesStore.setPeerGain(this.peer().id, value / 100);
  }
}
