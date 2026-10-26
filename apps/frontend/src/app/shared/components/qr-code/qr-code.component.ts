import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { encode } from 'uqr';

interface IQrData {
  readonly size: number;
  readonly d: string;
}

@Component({
  selector: 'app-qr-code',
  templateUrl: './qr-code.component.html',
  styleUrl: './qr-code.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCodeComponent {
  readonly value = input.required<string>();
  readonly size = input<number>(200);

  protected readonly qr = computed<IQrData | null>(() => {
    const val = this.value();
    if (!val) {
      return null;
    }
    const result = encode(val);
    const count = result.size;
    const paths: string[] = [];

    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (result.data[y][x]) {
          paths.push(`M${x},${y}h1v1h-1z`);
        }
      }
    }

    return {
      size: count,
      d: paths.join(''),
    };
  });
}
