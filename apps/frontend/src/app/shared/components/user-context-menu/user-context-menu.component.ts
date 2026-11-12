import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import {
  TuiDataList,
  TuiDropdown,
  TuiOptGroup,
  TuiOption,
} from '@taiga-ui/core';
import { TuiDataListDropdownManager } from '@taiga-ui/kit';

import { icons } from '@constants';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
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

  public readonly username = input<string>('');
  public readonly userId = input<number>();
  public readonly canModerate = input(false);
  public readonly moveTargets = input<readonly IUserContextMoveTarget[]>([]);

  public readonly details = output<void>();
  public readonly move = output<IUserContextMoveTarget>();
  public readonly disconnect = output<void>();

  protected readonly icons = icons;

  protected readonly isSelf = computed(() => {
    const current = this.currentUser();
    const id = this.userId();
    return current?.id === id;
  });

  protected readonly showVolume = computed(() => {
    const id = this.userId();
    const self = this.isSelf();
    return Boolean(id && !self);
  });

  protected readonly volume = computed(() => {
    const id = this.userId();
    const levels = this.voiceAudioPreferencesStore.peerGainLevels();
    if (!id) {
      return 100;
    }
    return Math.round((levels[id] ?? 1) * 100);
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

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected onVolumeChange(value: number): void {
    const id = this.userId();
    if (id) {
      this.voiceAudioPreferencesStore.setPeerGain(id, value / 100);
    }
  }
}
