import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComposerFocusService,
  prefersCoarsePointer,
} from './composer-focus.service';

describe('ComposerFocusService', () => {
  const previousMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = previousMatchMedia;
  });

  it('focuses the attached composer and clicks it on a coarse pointer', () => {
    window.matchMedia = (query: string) =>
      ({
        matches: query === '(pointer: coarse)',
        media: query,
      }) as MediaQueryList;
    const service = new ComposerFocusService();
    const editor = document.createElement('div');
    editor.tabIndex = -1;
    document.body.append(editor);
    const detach = service.attach(editor);
    const click = vi.spyOn(editor, 'click');

    service.focus();

    expect(document.activeElement).toBe(editor);
    expect(click).toHaveBeenCalledOnce();
    expect(prefersCoarsePointer()).toBe(true);

    detach();
    editor.blur();
    service.focus();
    expect(document.activeElement).not.toBe(editor);
    editor.remove();
  });

  it('does nothing before a composer is attached', () => {
    const service = new ComposerFocusService();
    expect(() => service.focus()).not.toThrow();
  });
});
