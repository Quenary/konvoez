import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PulseIndicatorVariant = 'ring' | 'glow';

@Component({
  selector: 'app-pulse-indicator',
  imports: [],
  templateUrl: './pulse-indicator.component.html',
  styleUrl: './pulse-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.pulse-indicator--ring]': 'variant() === "ring"',
    '[class.pulse-indicator--glow]': 'variant() === "glow"',
    '[class.pulse-indicator--circle]': 'shape() === "circle"',
    '[class.pulse-indicator--rounded]': 'shape() === "rounded"',
  },
})
export class PulseIndicatorComponent {
  readonly variant = input<PulseIndicatorVariant>('glow');
  /** Border radius for glow animation: circle (avatars) or rounded (buttons). */
  readonly shape = input<'circle' | 'rounded'>('circle');
}
