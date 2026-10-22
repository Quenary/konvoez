import {
  afterRenderEffect,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/**
 * Hands the host row to the virtualizer for measurement after it renders and
 * whenever its index changes (rows shift on prepend). The virtualizer keeps
 * observing the element size afterwards.
 */
@Directive({
  selector: '[appVirtualMeasure]',
  host: {
    '[attr.data-index]': 'appVirtualMeasureIndex()',
  },
})
export class VirtualMeasureDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appVirtualMeasure =
    input.required<(element: HTMLElement | null) => void>();
  readonly appVirtualMeasureIndex = input.required<number>();

  constructor() {
    afterRenderEffect({
      write: () => {
        this.appVirtualMeasureIndex();
        this.appVirtualMeasure()(this.el.nativeElement);
      },
    });
  }
}
