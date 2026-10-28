import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TViewerQualityMode } from '@core/services/remote-video-quality';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { icons } from '@constants';
import {
  TuiButton,
  TuiDataList,
  TuiDropdown,
  TuiHint,
  TuiOption,
} from '@taiga-ui/core';

const MODES = [
  { mode: 'auto', labelKey: 'CALL.VIEW_QUALITY_AUTO' },
  { mode: 'low', labelKey: 'CALL.VIEW_QUALITY_LOW' },
  { mode: 'medium', labelKey: 'CALL.VIEW_QUALITY_MEDIUM' },
  { mode: 'high', labelKey: 'CALL.VIEW_QUALITY_HIGH' },
  { mode: 'source', labelKey: 'CALL.VIEW_QUALITY_SOURCE' },
] as const satisfies ReadonlyArray<{
  mode: TViewerQualityMode;
  labelKey: string;
}>;

@Component({
  selector: 'app-voice-room-stream-quality',
  imports: [
    TranslatePipe,
    TuiButton,
    TuiDataList,
    TuiDropdown,
    TuiHint,
    TuiOption,
  ],
  templateUrl: './voice-room-stream-quality.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomStreamQualityComponent {
  private readonly remoteVideoViewService = inject(RemoteVideoViewService);

  protected readonly icons = icons;
  protected readonly modes = MODES;
  protected readonly quality = this.remoteVideoViewService.quality;

  protected select(mode: TViewerQualityMode): void {
    this.remoteVideoViewService.setQuality(mode);
  }
}
