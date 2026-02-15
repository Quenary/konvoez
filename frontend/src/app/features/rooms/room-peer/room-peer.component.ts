import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { VoiceRoomCommon } from '@common/voice-room';

@Component({
  selector: 'app-room-peer',
  imports: [],
  templateUrl: './room-peer.component.html',
  styleUrl: './room-peer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPeerComponent {
  public readonly peer = input.required<VoiceRoomCommon.IPeer>();
}
