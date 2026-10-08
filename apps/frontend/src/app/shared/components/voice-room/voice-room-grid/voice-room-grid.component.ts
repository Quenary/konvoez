import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { VoiceRoomTileComponent } from '../voice-room-tile/voice-room-tile.component';
import { VoiceRoomTilesService } from '../voice-room-tiles.service';
import { voiceSectionGridClass } from '../voice-peers-layout';

@Component({
  selector: 'app-voice-room-grid',
  imports: [VoiceRoomTileComponent],
  templateUrl: './voice-room-grid.component.html',
  styleUrl: './voice-room-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomGridComponent {
  private readonly voiceRoomTilesService = inject(VoiceRoomTilesService);

  protected readonly tiles = this.voiceRoomTilesService.tiles;

  protected readonly peersSectionClass = computed(() =>
    voiceSectionGridClass(this.tiles().length),
  );
}
