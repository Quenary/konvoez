import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { provideStore } from '@ngrx/store';
import { DirectChatDialogComponent } from './direct-chat-dialog.component';
import { UsersStore } from '@features/users/users.store';
import { UnreadCountsStore } from '@features/text-room/unread-counts.store';
import { EUserRole, IUser } from '@konvoez/shared';

describe('DirectChatDialogComponent', () => {
  let component: DirectChatDialogComponent;
  let fixture: ComponentFixture<DirectChatDialogComponent>;

  const mockCurrentUser: IUser = {
    id: 1,
    username: 'me',
    fullname: 'Current User',
    email: 'me@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const otherUser1: IUser = {
    id: 2,
    username: 'alice',
    fullname: 'Alice Wonderland',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const otherUser2: IUser = {
    id: 3,
    username: 'bob',
    fullname: 'Bob Builder',
    email: 'bob@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockUsersStore = {
    loadAll: vi.fn(),
    entities: vi
      .fn()
      .mockReturnValue([mockCurrentUser, otherUser1, otherUser2]),
  };

  const mockContext = {
    completeWith: vi.fn(),
    $implicit: undefined,
    data: undefined,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [DirectChatDialogComponent],
      providers: [
        provideTranslateService(),
        provideStore({
          auth: () => ({ user: mockCurrentUser }),
        }),
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockContext },
        {
          provide: UnreadCountsStore,
          useValue: {
            directUnreadCount: vi.fn().mockReturnValue(0),
            directTotal: vi.fn().mockReturnValue(0),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DirectChatDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create and load users', () => {
    expect(component).toBeTruthy();
    expect(mockUsersStore.loadAll).toHaveBeenCalled();
  });

  it('should filter out current user from filteredUsers', () => {
    const users = (
      component as unknown as { filteredUsers: () => IUser[] }
    ).filteredUsers();
    expect(users).toHaveLength(2);
    expect(users.some((u) => u.id === mockCurrentUser.id)).toBe(false);
  });

  it('should filter users by search query', async () => {
    const comp = component as unknown as {
      searchControl: { setValue: (v: string) => void };
      filteredUsers: () => IUser[];
    };

    comp.searchControl.setValue('alice');
    fixture.detectChanges();

    const users = comp.filteredUsers();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe('alice');
  });

  it('should complete with selected user on selectUser', () => {
    (component as unknown as { selectUser: (u: IUser) => void }).selectUser(
      otherUser1,
    );
    expect(mockContext.completeWith).toHaveBeenCalledWith(otherUser1);
  });

  it('should complete with null on close', () => {
    (component as unknown as { close: () => void }).close();
    expect(mockContext.completeWith).toHaveBeenCalledWith(null);
  });
});
