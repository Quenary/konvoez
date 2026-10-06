import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import {
  TuiButton,
  TuiHint,
  TuiInput,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { TuiAutoFocus } from '@taiga-ui/cdk';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { FileDropDirective } from '@shared/directives/file-drop.directive';
import { ChatEditorComponent } from './chat-editor/chat-editor.component';
import { ChatMessagesListComponent } from './chat-messages-list/chat-messages-list.component';
import { ChatStore } from './chat.store';

@Component({
  selector: 'app-chat',
  imports: [
    ChatEditorComponent,
    ChatMessagesListComponent,
    TuiTitle,
    TuiHeader,
    TuiButton,
    TuiHint,
    TuiTextfield,
    TuiInput,
    TuiAutoFocus,
    TuiAvatar,
    TuiInitialsPipe,
    NgOptimizedImage,
    ReactiveFormsModule,
    TranslatePipe,
    FileDropDirective,
  ],
  providers: [ChatStore],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {
  protected readonly chatStore = inject(ChatStore);

  public readonly roomId = input<number | null>(null);
  public readonly recipientId = input<number | null>(null);
  public readonly title = input.required<string>();
  public readonly avatarUrl = input<string | null>(null);

  protected readonly searchControl = new FormControl<string>('', {
    nonNullable: true,
  });

  private readonly editor = viewChild(ChatEditorComponent);

  constructor() {
    effect(() => {
      const roomId = this.roomId();
      const recipientId = this.recipientId();

      // join()/patchState read store signals; keep them untracked or the
      // effect re-runs on every store update and freezes the tab.
      untracked(() => {
        if (roomId != null) {
          this.chatStore.join({ kind: 'room', id: roomId });
        } else if (recipientId != null) {
          this.chatStore.join({ kind: 'direct', id: recipientId });
        }
        this.searchControl.setValue('', { emitEvent: false });
      });
    });

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => {
        this.chatStore.setSearchQuery(query);
      });
  }

  protected onFilesDropped(files: File[]): void {
    this.editor()?.addFiles(files);
  }

  protected toggleSearch(): void {
    this.onSearchOpenChange(!this.chatStore.isSearchOpen());
  }

  protected onSearchOpenChange(open: boolean): void {
    this.chatStore.setSearchOpen(open);
    if (!open && this.searchControl.value) {
      this.clearSearch();
    }
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
    this.chatStore.clearSearch();
  }
}
