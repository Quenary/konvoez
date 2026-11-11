import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  viewChildren,
} from '@angular/core';
import type { ISerializableSource } from '@konvoez/client-shell';
import { SourceCardComponent } from '../source-card/source-card.component';

@Component({
  selector: 'app-source-grid',
  imports: [SourceCardComponent],
  template: `
    @if (sources().length === 0) {
      <div class="empty">
        <ng-content select="[empty]" />
      </div>
    } @else {
      <div
        class="grid"
        role="listbox">
        @for (source of sources(); track source.id; let idx = $index) {
          @let isSelected = value() === source.id;
          @let isDefaultFocused = !value() && idx === 0;
          <app-source-card
            [sourceId]="source.id"
            [name]="source.name"
            [thumbnailUrl]="source.thumbnailUrl"
            [appIconUrl]="source.appIconUrl"
            [selected]="isSelected"
            [tabIndex]="isSelected || isDefaultFocused ? 0 : -1"
            (sourceSelect)="onCardSelect($event)"
            (sourceActivate)="onCardActivate($event)" />
        }
      </div>
    }
  `,
  styleUrl: './source-grid.component.scss',
  host: {
    '(keydown)': 'handleKeyDown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceGridComponent {
  public readonly sources = input<ISerializableSource[]>([]);
  public readonly value = input<string | null>(null);

  public readonly sourceSelect = output<string>();
  public readonly sourceActivate = output<string>();

  private readonly cardComponents = viewChildren(SourceCardComponent);

  protected onCardSelect(sourceId: string): void {
    this.sourceSelect.emit(sourceId);
  }

  protected onCardActivate(sourceId: string): void {
    this.sourceActivate.emit(sourceId);
  }

  protected handleKeyDown(e: KeyboardEvent): void {
    const srcList = this.sources();
    if (srcList.length === 0) return;

    const currentVal = this.value();
    const currentIndex = srcList.findIndex((s) => s.id === currentVal);
    const validCurrent = currentIndex >= 0 ? currentIndex : 0;
    let nextIndex = validCurrent;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (validCurrent + 1) % srcList.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (validCurrent - 1 + srcList.length) % srcList.length;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = Math.min(validCurrent + 2, srcList.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = Math.max(validCurrent - 2, 0);
    } else {
      return;
    }

    const nextSource = srcList[nextIndex];
    if (nextSource) {
      this.sourceSelect.emit(nextSource.id);
      setTimeout(() => {
        const cards = this.cardComponents();
        cards[nextIndex]?.focus();
      });
    }
  }
}
