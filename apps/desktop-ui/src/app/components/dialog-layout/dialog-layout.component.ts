import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-dialog-layout',
  imports: [],
  template: `
    <div class="dialog-layout">
      @if (heading()) {
        <header class="dialog-header">
          <h1 class="dialog-title">{{ heading() }}</h1>
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
