import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMentionSuggestionVm,
  MentionSuggestionsComponent,
} from './mention-suggestions.component';

describe('MentionSuggestionsComponent', () => {
  let fixture: ComponentFixture<MentionSuggestionsComponent>;
  let element: HTMLElement;

  const items: IMentionSuggestionVm[] = [
    {
      key: 'user-1',
      kind: 'user',
      id: 1,
      label: '@alice',
      secondary: 'Alice Wonderland',
      avatar: {
        kind: 'user',
        username: 'alice',
        fullname: 'Alice Wonderland',
        avatarUrl: 'https://example.com/alice.png',
      },
      active: true,
    },
    {
      key: 'role-10',
      kind: 'role',
      id: 10,
      label: '@Admin',
      secondary: '',
      avatar: {
        kind: 'role',
        name: 'Admin',
        color: '#ff0000',
      },
      active: false,
    },
    {
      key: 'everyone',
      kind: 'everyone',
      id: null,
      label: '@everyone',
      secondary: 'Notify everyone',
      avatar: {
        kind: 'everyone',
      },
      active: false,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MentionSuggestionsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MentionSuggestionsComponent);
    element = fixture.nativeElement;
  });

  it('renders suggestion items with avatars, labels, secondary text and active class', () => {
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const buttons = element.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(3);

    // First button (user, active)
    expect(buttons[0].classList.contains('active')).toBe(true);
    expect(buttons[0].querySelector('app-mention-avatar')).toBeTruthy();
    expect(buttons[0].querySelector('.label')?.textContent).toContain('@alice');
    expect(buttons[0].querySelector('.secondary')?.textContent).toContain(
      'Alice Wonderland',
    );

    // Second button (role, inactive)
    expect(buttons[1].classList.contains('active')).toBe(false);
    expect(buttons[1].querySelector('.label')?.textContent).toContain('@Admin');

    // Third button (everyone, inactive)
    expect(buttons[2].classList.contains('active')).toBe(false);
    expect(buttons[2].querySelector('.label')?.textContent).toContain(
      '@everyone',
    );
    expect(buttons[2].querySelector('.secondary')?.textContent).toContain(
      'Notify everyone',
    );
  });

  it('emits picked event when an item is clicked', () => {
    const pickedSpy = vi.fn();
    fixture.componentRef.setInput('items', items);
    fixture.componentInstance.picked.subscribe(pickedSpy);
    fixture.detectChanges();

    const buttons =
      element.querySelectorAll<HTMLButtonElement>('button[tuiOption]');
    buttons[1].click();

    expect(pickedSpy).toHaveBeenCalledWith(items[1]);
  });
});
