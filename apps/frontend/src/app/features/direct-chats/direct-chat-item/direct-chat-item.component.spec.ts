import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { provideStore } from '@ngrx/store';
import { DirectChatItemComponent } from './direct-chat-item.component';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { EUserRole, IUser } from '@konvoez/shared';

describe('DirectChatItemComponent', () => {
  let component: DirectChatItemComponent;
  let fixture: ComponentFixture<DirectChatItemComponent>;

  const currentUser: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Wonderland',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const otherUser: IUser = {
    id: 2,
    username: 'bob',
    fullname: 'Bob Builder',
    email: 'bob@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockUnreadCountsStore = {
    directUnreadCount: vi.fn((userId: number) => (userId === 2 ? 5 : 3)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [DirectChatItemComponent],
      providers: [
        provideTranslateService(),
        provideStore({
          auth: () => ({ user: currentUser }),
        }),
        { provide: UnreadCountsStore, useValue: mockUnreadCountsStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DirectChatItemComponent);
    component = fixture.componentInstance;
  });

  it('renders standard user direct chat item with avatar, names, and unread badge', async () => {
    fixture.componentRef.setInput('user', otherUser);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['isSelf']()).toBe(false);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('bob');
    expect(el.textContent).toContain('Bob Builder');
    expect(el.querySelector('app-user-avatar')).toBeTruthy();
    expect(
      el.querySelector('tui-badge-notification')?.textContent?.trim(),
    ).toBe('5');
    expect(el.querySelector('[tuiAvatar="@tui.bookmark"]')).toBeNull();
  });

  it('renders Saved Messages item with bookmark icon and no unread badge when user is self', async () => {
    fixture.componentRef.setInput('user', currentUser);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['isSelf']()).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('DIRECT.SAVED_MESSAGES');
    expect(el.textContent).not.toContain('Alice Wonderland');
    expect(el.querySelector('app-user-avatar')).toBeNull();
    expect(el.querySelector('[tuiAvatar="@tui.bookmark"]')).toBeTruthy();
    expect(el.querySelector('tui-badge-notification')).toBeNull();
  });

  it('emits selected output on button click', async () => {
    fixture.componentRef.setInput('user', otherUser);
    fixture.detectChanges();
    await fixture.whenStable();

    const selectedSpy = vi.fn();
    component.selected.subscribe(selectedSpy);

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('button');
    button.click();

    expect(selectedSpy).toHaveBeenCalledWith(otherUser);
  });
});
