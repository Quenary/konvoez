import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiLabel, TuiSlider, TuiTextfield } from '@taiga-ui/core';
import { TuiInputSlider } from '@taiga-ui/kit';

@Component({
  selector: 'app-volume-control',
  imports: [FormsModule, TuiLabel, TuiSlider, TuiTextfield, TuiInputSlider],
  templateUrl: './volume-control.component.html',
  styleUrl: './volume-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'volume-control',
  },
})
export class VolumeControlComponent {
  public readonly value = input.required<number>();
  public readonly id = input.required<string>();
  public readonly min = input(0);
  public readonly max = input(200);
  public readonly label = input.required<string>();

  public readonly valueChange = output<number>();
}
