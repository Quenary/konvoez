import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { provideStore } from '@ngrx/store';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { DirectChatsComponent } from './direct-chats.component';
import { DirectChatsStore } from './direct-chats.store';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { UsersStore } from '@core/stores/users.store';
import { IUserSafe } from '@konvoez/shared';

@Component({
  selector: 'app-direct-chats-route-stub',
  template: '',
})
class DirectChatsRouteStubComponent {}

describe('DirectChatsComponent', () => {
  let component: DirectChatsComponent;
  let fixture: ComponentFixture<DirectChatsComponent>;
  let router: Router;

  const mockUser: IUserSafe = {
    id: 10,
    username: 'john_doe',
    fullname: 'John Doe',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const currentUser: IUserSafe = {
    ...mockUser,
    id: 1,
    username: 'me',
    fullname: 'Me',
  };

  const directChatEntities = signal<IUserSafe[]>([mockUser]);
  const directChatsLoading = signal(false);
  const activatedRoute: { firstChild: ActivatedRoute | null } = {
    firstChild: null,
  };

  const mockDirectChatsStore = {
    entities: directChatEntities,
    loading: directChatsLoading,
    loaded: signal(true),
    loadDirectChats: vi.fn(),
    addOrUpdateChat: vi.fn(),
  };

  const usersEntityMap = signal<Record<number, IUserSafe>>({
    [mockUser.id]: mockUser,
  });

  const mockUsersStore = {
    loadAll: vi.fn(),
    entities: vi.fn().mockReturnValue([mockUser]),
    entityMap: usersEntityMap,
    onlineMap: vi.fn().mockReturnValue({}),
  };

  const mockDialogService = {
    open: vi.fn().mockReturnValue(of(mockUser)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    directChatEntities.set([mockUser]);
    directChatsLoading.set(false);
    usersEntityMap.set({ [mockUser.id]: mockUser });
    activatedRoute.firstChild = null;
    mockDialogService.open.mockReturnValue(of(mockUser));

    await TestBed.configureTestingModule({
      imports: [DirectChatsComponent],
      providers: [
        provideRouter([
          { path: 'opened', component: DirectChatsRouteStubComponent },
        ]),
        provideTranslateService(),
        provideStore({
          auth: () => ({ user: currentUser }),
        }),
        { provide: DirectChatsStore, useValue: mockDirectChatsStore },
        { provide: ActivatedRoute, useValue: activatedRoute },
        { provide: UsersStore, useValue: mockUsersStore },
        {
          provide: TuiResponsiveDialogService,
          useValue: mockDialogService,
        },
        {
          provide: UnreadCountsStore,
          useValue: {
            directUnreadCount: vi.fn().mockReturnValue(0),
            directTotal: vi.fn().mockReturnValue(0),
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(DirectChatsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component['hasChildRoute']()).toBe(false);
  });

  it('should load direct chats and users on init', () => {
    expect(mockDirectChatsStore.loadDirectChats).toHaveBeenCalled();
    expect(mockUsersStore.loadAll).toHaveBeenCalled();
  });

  it('should navigate to /direct/:id when openChat is called', () => {
    component['openChat'](mockUser);
    expect(router.navigate).toHaveBeenCalledWith(['/direct', 10]);
  });

  it('should open new chat dialog and navigate on user selection', async () => {
    await component['openNewChatDialog']();

    expect(mockDialogService.open).toHaveBeenCalled();
    expect(mockDirectChatsStore.addOrUpdateChat).toHaveBeenCalledWith(mockUser);
    expect(router.navigate).toHaveBeenCalledWith(['/direct', 10]);
  });

  it('reactively updates rendered user info when UsersStore entityMap changes on USER_UPDATED', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('john_doe');
    expect(el.textContent).toContain('John Doe');
    expect(el.querySelector('app-user-avatar img')).toBeNull();

    usersEntityMap.set({
      [mockUser.id]: {
        ...mockUser,
        username: 'john_updated',
        fullname: 'John Updated',
        avatarUrl: 'https://example.com/john-new.webp',
      },
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('john_updated');
    expect(el.textContent).toContain('John Updated');
    const img = el.querySelector('app-user-avatar img');
    expect(img?.getAttribute('src')).toBe('https://example.com/john-new.webp');
  });

  it('renders the stored chat when that user is not in UsersStore yet', () => {
    usersEntityMap.set({});
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('john_doe');
    expect(fixture.nativeElement.textContent).toContain('John Doe');
  });

  it('shows the empty state after the chat list has loaded with no chats', async () => {
    directChatEntities.set([]);
    directChatsLoading.set(false);
    fixture.detectChanges();

    const empty: HTMLElement | null =
      fixture.nativeElement.querySelector('.empty-state');
    expect(empty?.textContent).toContain('DIRECT.EMPTY_TITLE');
    expect(fixture.nativeElement.querySelector('.chats-list')).toBeNull();

    empty?.querySelector('button')?.click();
    await fixture.whenStable();

    expect(mockDialogService.open).toHaveBeenCalled();
  });

  it('hides the empty state while the chat list is loading', () => {
    directChatEntities.set([]);
    directChatsLoading.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-state')).toBeNull();
    expect(fixture.nativeElement.querySelector('.chats-list')).toBeNull();
  });

  it('does not add a chat when the new-chat dialog is dismissed', async () => {
    mockDialogService.open.mockReturnValueOnce(of(null));

    await component['openNewChatDialog']();

    expect(mockDirectChatsStore.addOrUpdateChat).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('opens the selected chat from the list', () => {
    const row: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      'app-direct-chat-item button',
    );
    row?.click();

    expect(router.navigate).toHaveBeenCalledWith(['/direct', mockUser.id]);
  });

  it('hides the chat list while a direct chat route is open', async () => {
    vi.mocked(router.navigate).mockRestore();
    activatedRoute.firstChild = {} as ActivatedRoute;
    await router.navigateByUrl('/opened');
    fixture.detectChanges();

    expect(component['hasChildRoute']()).toBe(true);
    expect(fixture.nativeElement.querySelector('app-route-page')).toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
