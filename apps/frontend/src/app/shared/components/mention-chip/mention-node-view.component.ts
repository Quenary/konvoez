import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  Input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { TuiNodeViewNg } from '@taiga-ui/editor/extensions/tiptap-node-view';
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { RolesStore } from '@core/stores/roles.store';
import { UsersStore } from '@core/stores/users.store';
import { IUser } from '@konvoez/shared';
import { MentionChipComponent } from './mention-chip.component';
import { buildMentionChipVm, IMentionChipContext } from './mention-chip.vm';

@Component({
  selector: 'app-mention-node-view',
  imports: [MentionChipComponent],
  template: `
    <app-mention-chip
      [vm]="vm()"
      [class.selected]="selectedSig()"
      contenteditable="false" />
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentionNodeViewComponent extends TuiNodeViewNg {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly usersStore = inject(UsersStore);
  private readonly rolesStore = inject(RolesStore);
  private readonly store = inject(Store);
  private readonly translate = inject(TranslateService);

  @Input()
  override get node(): ProseMirrorNode {
    return this.nodeSig()!;
  }

  override set node(n: ProseMirrorNode) {
    this.nodeSig.set(n);
    this.changeDetectorRef.markForCheck();
  }

  protected readonly nodeSig = signal<ProseMirrorNode | null>(null);
  protected readonly selectedSig = signal<boolean>(false);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly unknownLabel = toSignal(
    this.translate.stream('CHAT.MENTION_UNKNOWN'),
    { initialValue: 'unknown' },
  );

  protected readonly vm = computed(() => {
    const node = this.nodeSig();
    const kind = (node?.attrs?.['kind'] as string) ?? 'unknown';
    const id = (node?.attrs?.['id'] as number | null) ?? null;
    const ctx: IMentionChipContext = {
      usersById: this.usersStore.entityMap() as Record<number, IUser>,
      rolesById: this.rolesStore.rolesById(),
      me: this.currentUser() ?? null,
      unknownLabel: this.unknownLabel(),
    };
    return buildMentionChipVm({ kind, id }, ctx);
  });

  constructor() {
    super();
    Object.defineProperty(this, 'selected', {
      get: () => this.selectedSig(),
      set: (v: boolean) => {
        this.selectedSig.set(v);
        this.changeDetectorRef.markForCheck();
      },
      configurable: true,
      enumerable: true,
    });
  }
}
