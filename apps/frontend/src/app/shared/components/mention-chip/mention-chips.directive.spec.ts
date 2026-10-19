import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import {
  TUI_EDITOR_OPTIONS,
  TUI_EDITOR_SANITIZER,
  TuiEditorSocket,
} from '@taiga-ui/editor';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IRoleSummary, IUser } from '@konvoez/shared';
import { MentionChipsDirective } from './mention-chips.directive';
import { IMentionChipContext } from './mention-chip.vm';

@Component({
  imports: [TuiEditorSocket, MentionChipsDirective],
  template: `
    <tui-editor-socket
      [content]="content()"
      [appMentionChips]="ctx()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestHostComponent {
  readonly content = signal<string | null>(null);
  readonly ctx = signal<IMentionChipContext>({
    usersById: {},
    rolesById: {},
    me: null,
    unknownLabel: 'unknown',
  });
}

describe('MentionChipsDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let appRef: ApplicationRef;

  const alice: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Wonderland',
    email: 'alice@example.com',
    avatar: null,
    avatarUrl: 'https://example.com/alice.png',
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const adminRole: IRoleSummary = {
    id: 10,
    name: 'Admin',
    color: '#ff0000',
    priority: 1,
    mentionable: true,
  };

  const baseCtx: IMentionChipContext = {
    usersById: { 1: alice },
    rolesById: { 10: adminRole },
    me: null,
    unknownLabel: 'unknown',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        {
          provide: TUI_EDITOR_OPTIONS,
          useValue: { enableDefaultStyles: true },
        },
        {
          provide: TUI_EDITOR_SANITIZER,
          useClass: NgDompurifySanitizer,
        },
      ],
    }).compileComponents();

    appRef = TestBed.inject(ApplicationRef);
    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    host.ctx.set(baseCtx);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('mounts app-mention-chip into placeholder spans for user, role, and everyone', async () => {
    host.content.set(
      '<p>Hey <span data-type="mention" data-kind="user" data-id="1">&lt;@1&gt;</span>, ' +
        '<span data-type="mention" data-kind="role" data-id="10">&lt;@&amp;10&gt;</span> and ' +
        '<span data-type="mention" data-kind="everyone">@everyone</span></p>',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const chips = fixture.nativeElement.querySelectorAll('app-mention-chip');
    expect(chips.length).toBe(3);

    // User chip: has tuiChip xs, username, img avatar
    expect(chips[0].textContent).toContain('@alice');
    expect(chips[0].querySelector('img')).toBeTruthy();
    expect(chips[0].querySelector('[tuiChip]')).toBeTruthy();

    // Role chip: has tuiChip xs, role name, role color
    expect(chips[1].textContent).toContain('@Admin');
    expect(chips[1].querySelector('[tuiChip]')).toBeTruthy();

    // Everyone chip: has tuiChip xs, @everyone, tui-icon
    expect(chips[2].textContent).toContain('@everyone');
    expect(chips[2].querySelector('tui-icon')).toBeTruthy();
  });

  it('renders @unknown chip without avatar when user/role id is missing', async () => {
    host.content.set(
      '<p><span data-type="mention" data-kind="user" data-id="999">&lt;@999&gt;</span></p>',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const chip = fixture.nativeElement.querySelector('app-mention-chip');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('@unknown');
    expect(chip.querySelector('img')).toBeFalsy();
    expect(chip.querySelector('tui-icon')).toBeFalsy();
  });

  it('destroys old component refs on content change without leaking views', async () => {
    host.content.set(
      '<p><span data-type="mention" data-kind="user" data-id="1">&lt;@1&gt;</span></p>',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelectorAll('app-mention-chip').length,
    ).toBe(1);
    const viewCountAfterFirst =
      (appRef as unknown as { _views: unknown[] })._views?.length ?? 0;

    // Change content to have two mentions
    host.content.set(
      '<p><span data-type="mention" data-kind="user" data-id="1">&lt;@1&gt;</span> ' +
        '<span data-type="mention" data-kind="everyone">@everyone</span></p>',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelectorAll('app-mention-chip').length,
    ).toBe(2);

    // Clear content
    host.content.set('<p>No mentions</p>');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelectorAll('app-mention-chip').length,
    ).toBe(0);
    const viewCountAfterClear =
      (appRef as unknown as { _views: unknown[] })._views?.length ?? 0;
    expect(viewCountAfterClear).toBeLessThanOrEqual(viewCountAfterFirst);
  });

  it('updates the rendered label when context updates (e.g. user rename)', async () => {
    host.content.set(
      '<p><span data-type="mention" data-kind="user" data-id="1">&lt;@1&gt;</span></p>',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('app-mention-chip')?.textContent,
    ).toContain('@alice');

    host.ctx.set({
      ...baseCtx,
      usersById: {
        1: { ...alice, username: 'alice_renamed' },
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('app-mention-chip')?.textContent,
    ).toContain('@alice_renamed');
  });
});
