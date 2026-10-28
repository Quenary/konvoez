import { Injectable } from '@angular/core';

/** Primary pointer is a finger, so the OS shows a virtual keyboard. */
export function prefersCoarsePointer(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/**
 * The composer of one chat. Provided by `ChatComponent`. Reply and edit call
 * `focus` inside the user gesture so the real editor receives focus while the
 * browser still allows the virtual keyboard.
 */
@Injectable()
export class ComposerFocusService {
  private editor: HTMLElement | null = null;

  attach(editor: HTMLElement): () => void {
    this.editor = editor;
    return () => {
      if (this.editor === editor) {
        this.editor = null;
      }
    };
  }

  focus(): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    editor.focus();
    // A drag's touchend focuses the field but iOS does not show the keyboard
    // until the field is also clicked in that same gesture.
    if (prefersCoarsePointer()) {
      editor.click();
    }
  }
}
