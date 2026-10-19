import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injector,
  input,
  untracked,
} from '@angular/core';
import { TuiEditorSocket } from '@taiga-ui/editor';
import { MentionChipComponent } from './mention-chip.component';
import { buildMentionChipVm, IMentionChipContext } from './mention-chip.vm';

@Directive({
  selector: 'tui-editor-socket[appMentionChips]',
})
export class MentionChipsDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly socket = inject(TuiEditorSocket);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly injector = inject(Injector);
  private readonly appRef = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);

  public readonly appMentionChips = input.required<IMentionChipContext>();

  private componentRefs: ComponentRef<MentionChipComponent>[] = [];

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyComponents();
    });

    effect(() => {
      const ctx = this.appMentionChips();
      const content = this.socket.content();

      untracked(() => {
        this.destroyComponents();

        if (!content) {
          return;
        }

        const host = this.elementRef.nativeElement;
        const spans = host.querySelectorAll<HTMLSpanElement>(
          'span[data-type="mention"]',
        );

        for (const span of Array.from(spans)) {
          const kind = span.getAttribute('data-kind') ?? 'unknown';
          const rawId = span.getAttribute('data-id');
          const id =
            rawId !== null && rawId !== '' ? parseInt(rawId, 10) : null;

          const ref = createComponent(MentionChipComponent, {
            environmentInjector: this.environmentInjector,
            elementInjector: this.injector,
          });

          ref.setInput('vm', buildMentionChipVm({ kind, id }, ctx));
          ref.changeDetectorRef.detectChanges();
          this.appRef.attachView(ref.hostView);
          span.textContent = '';
          span.appendChild(ref.location.nativeElement);
          this.componentRefs.push(ref);
        }
      });
    });
  }

  private destroyComponents(): void {
    for (const ref of this.componentRefs) {
      this.appRef.detachView(ref.hostView);
      ref.destroy();
    }
    this.componentRefs = [];
  }
}
