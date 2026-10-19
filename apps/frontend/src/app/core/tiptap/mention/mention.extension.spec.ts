import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RolesStore } from '@core/stores/roles.store';
import { UsersStore } from '@core/stores/users.store';
import { createKonvoezMention } from './mention.extension';

describe('createKonvoezMention', () => {
  let editor: Editor | null = null;
  let injector: Injector;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideMockStore({
          initialState: {
            auth: {
              init: true,
              user: null,
              loading: false,
            },
          },
        }),
        UsersStore,
        RolesStore,
      ],
    });
    store = TestBed.inject(MockStore);
    injector = TestBed.inject(Injector);
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('configures mention node as an inline atom node', () => {
    const mention = createKonvoezMention(injector);

    expect(mention.name).toBe('mention');
    expect(mention.config.group).toBe('inline');
    expect(mention.config.inline).toBe(true);
    expect(mention.config.atom).toBe(true);
    expect(mention.config.selectable).toBe(true);
  });

  it('parses span[data-type="mention"] and serializes to span with attributes and @label', () => {
    editor = new Editor({
      extensions: [Document, Paragraph, Text, createKonvoezMention(injector)],
      content:
        '<p>Hi <span data-type="mention" data-kind="user" data-id="12">@alice</span>, ' +
        '<span data-type="mention" data-kind="role" data-id="3">@Admin</span> and ' +
        '<span data-type="mention" data-kind="everyone">@everyone</span></p>',
    });

    const html = editor.getHTML();
    expect(html).toContain('data-type="mention"');
    expect(html).toContain('data-kind="user"');
    expect(html).toContain('data-id="12"');
    expect(html).toContain('@alice');
    expect(html).toContain('data-kind="role"');
    expect(html).toContain('data-id="3"');
    expect(html).toContain('@Admin');
    expect(html).toContain('data-kind="everyone"');
    expect(html).toContain('@everyone');
  });

  it('handles label attribute without leading @ and avoids duplicate @', () => {
    editor = new Editor({
      extensions: [Document, Paragraph, Text, createKonvoezMention(injector)],
      content:
        '<p><span data-type="mention" data-kind="user" data-id="5">bob</span></p>',
    });

    const html = editor.getHTML();
    expect(html).toContain('@bob');
    expect(html).not.toContain('@@bob');
  });
});
