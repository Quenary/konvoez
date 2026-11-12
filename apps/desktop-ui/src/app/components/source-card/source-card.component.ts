import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-source-card',
  imports: [],
  template: `
    <div class="thumb-wrapper">
      <img
        class="thumb"
        [src]="thumbnailUrl()"
        alt="" />
      @if (appIconUrl(); as icon) {
        <img
          class="app-icon"
          [src]="icon"
          alt="" />
      }
    </div>
    <div
      class="name"
      [title]="name()">
      {{ name() }}
    </div>
  `,
  styleUrl: './source-card.component.scss',
  host: {
    role: 'option',
    '[class.selected]': 'selected()',
    '[attr.aria-selected]': 'selected()',
    '(click)': 'handleClick()',
    '(dblclick)': 'handleDblClick()',
    '(keydown)': 'handleKeyDown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceCardComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  public readonly sourceId = input.required<string>();
  public readonly name = input<string>('');
  public readonly thumbnailUrl = input<string>('');
  public readonly appIconUrl = input<string | null>(null);
  public readonly selected = input<boolean>(false);

  public readonly sourceSelect = output<string>();
  public readonly sourceActivate = output<string>();

  public focus(): void {
    this.elementRef.nativeElement.focus();
  }

  protected handleClick(): void {
    this.sourceSelect.emit(this.sourceId());
  }

  protected handleDblClick(): void {
    this.sourceActivate.emit(this.sourceId());
  }

  protected handleKeyDown(e: KeyboardEvent): void {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      this.sourceSelect.emit(this.sourceId());
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.sourceActivate.emit(this.sourceId());
    }
  }
}
