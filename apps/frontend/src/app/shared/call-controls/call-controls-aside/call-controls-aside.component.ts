import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiGroup, TuiHint, TuiIcon } from '@taiga-ui/core';
import { TuiFade } from '@taiga-ui/kit';
import { icons } from '@constants';
import { CallControlsService } from '../call-controls.service';

@Component({
  selector: 'app-call-controls-aside',
  imports: [TranslatePipe, TuiGroup, TuiButton, TuiHint, TuiFade, TuiIcon],
  templateUrl: './call-controls-aside.component.html',
  styleUrl: './call-controls-aside.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CallControlsService],
})
export class CallControlsAsideComponent {
  protected readonly callControlsService = inject(CallControlsService);

  public readonly collapsed = input.required<boolean>();

  protected readonly icons = icons;
}
