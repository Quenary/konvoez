import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  TemplateRef,
} from '@angular/core';
import { computeMediaGridLayout } from './media-grid.layout';

@Component({
  selector: 'app-media-grid',
  imports: [NgTemplateOutlet],
  templateUrl: './media-grid.component.html',
  styleUrl: './media-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaGridComponent<T> {
  public readonly items = input.required<readonly T[]>();
  public readonly template =
    input.required<TemplateRef<{ $implicit: T; index: number }>>();
  public readonly aspect = input<{ width: number; height: number } | null>(
    null,
  );

  protected readonly cells = computed(() => {
    const items = this.items();
    const aspect = this.aspect();
    const layout = computeMediaGridLayout(items.length, aspect);
    const aspectRatio =
      layout.singleAspect !== null && items.length <= 2
        ? String(layout.singleAspect)
        : '1';
    return items.map((item, index) => ({
      item,
      index,
      gridColumn: `span ${layout.cells[index]?.colSpan ?? 1}`,
      aspectRatio,
    }));
  });
}
