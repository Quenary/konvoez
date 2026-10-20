import { ApplicationRef, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { RolesStore } from '@core/stores/roles.store';
import { UsersStore } from '@core/stores/users.store';
import { createKonvoezMention } from '@core/tiptap/mention/mention.extension';
import { IRole, IUser } from '@konvoez/shared';
import { MentionNodeViewComponent } from './mention-node-view.component';

describe('MentionNodeViewComponent', () => {
  let editor: Editor | null = null;
  let container: HTMLDivElement;
  let store: MockStore;

  const me: IUser = {
    id: 99,
    username: 'myuser',
    fullname: 'My User',
    email: 'my@example.com',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const alice: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Wonderland',
    email: 'alice@example.com',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const usersMap = signal<Record<number, IUser>>({});
  const mockUsersStore = {
    entityMap: usersMap,
  };

  const rolesMap = signal<Record<number, IRole>>({});
  const mockRolesStore = {
    rolesById: rolesMap,
  };

  beforeEach(() => {
    usersMap.set({});
    rolesMap.set({});

    TestBed.configureTestingModule({
      imports: [MentionNodeViewComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: RolesStore, useValue: mockRolesStore },
      ],
    });

    store = TestBed.inject(MockStore);

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
    container.remove();
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('mounts through TuiNodeView in a real tiptap Editor and shows username', async () => {
    usersMap.set({ [alice.id]: alice });
    const injector = TestBed.inject(Injector);
    const appRef = TestBed.inject(ApplicationRef);

    editor = new Editor({
      element: container,
      extensions: [Document, Paragraph, Text, createKonvoezMention(injector)],
      content:
        '<p>Hey <span data-type="mention" data-kind="user" data-id="1">@alice</span>!</p>',
    });

    appRef.tick();

    const chip = container.querySelector('app-mention-chip');
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toContain('@alice');
  });

  it('updates the rendered label when UsersStore entity changes', async () => {
    usersMap.set({ [alice.id]: alice });
    const injector = TestBed.inject(Injector);
    const appRef = TestBed.inject(ApplicationRef);

    editor = new Editor({
      element: container,
      extensions: [Document, Paragraph, Text, createKonvoezMention(injector)],
      content:
        '<p><span data-type="mention" data-kind="user" data-id="1">@alice</span></p>',
    });

    appRef.tick();
    expect(container.querySelector('app-mention-chip')?.textContent).toContain(
      '@alice',
    );

    usersMap.set({
      [alice.id]: {
        ...alice,
        username: 'alice_renamed',
      },
    });
    appRef.tick();

    expect(container.querySelector('app-mention-chip')?.textContent).toContain(
      '@alice_renamed',
    );
  });

  it('toggles selected class when node is selected', async () => {
    usersMap.set({ [alice.id]: alice });
    const injector = TestBed.inject(Injector);
    const appRef = TestBed.inject(ApplicationRef);

    editor = new Editor({
      element: container,
      extensions: [Document, Paragraph, Text, createKonvoezMention(injector)],
      content:
        '<p><span data-type="mention" data-kind="user" data-id="1">@alice</span></p>',
    });

    appRef.tick();
    const chip = container.querySelector('app-mention-chip');
    expect(chip?.classList.contains('selected')).toBe(false);

    // Select the mention node
    const mentionPos = 1; // position inside the paragraph before the mention node
    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, mentionPos),
      ),
    );
    appRef.tick();

    expect(chip?.classList.contains('selected')).toBe(true);
  });
});
