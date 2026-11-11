import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { TuiFade } from '@taiga-ui/kit';
import { icons } from '@constants';
import { CallControlsService } from '../call-controls.service';

@Component({
  selector: 'app-call-controls-bar',
  imports: [TranslatePipe, TuiButton, TuiIcon, TuiFade],
  templateUrl: './call-controls-bar.component.html',
  styleUrl: './call-controls-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CallControlsService],
})
export class CallControlsBarComponent {
  protected readonly callControlsService = inject(CallControlsService);

  protected readonly icons = icons;
}
