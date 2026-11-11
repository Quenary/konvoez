import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TuiTitle } from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';

@Component({
  selector: 'app-dialog-layout',
  imports: [TuiHeader, TuiTitle],
  template: `
    <div class="dialog-layout">
      @if (heading()) {
        <header
          tuiHeader
          class="dialog-header">
          <h1 tuiTitle>{{ heading() }}</h1>
        </header>
      }
      <main class="dialog-content">
        <ng-content />
      </main>
      <footer
        class="dialog-footer"
        [class.align-between]="actionsAlign() === 'between'">
        <ng-content select="[actions]" />
      </footer>
    </div>
  `,
  styleUrl: './dialog-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogLayoutComponent {
  public readonly heading = input<string>('');
  public readonly actionsAlign = input<'end' | 'between'>('end');
}
