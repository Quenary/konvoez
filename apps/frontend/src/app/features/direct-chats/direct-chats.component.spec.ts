import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogService } from '@taiga-ui/core';
import { DirectChatsComponent } from './direct-chats.component';
import { DirectChatsStore } from './direct-chats.store';
import { UsersStore } from '@features/users/users.store';
import { EUserRole, IUser } from '@konvoez/shared';

describe('DirectChatsComponent', () => {
  let component: DirectChatsComponent;
  let fixture: ComponentFixture<DirectChatsComponent>;
  let router: Router;

  const mockUser: IUser = {
    id: 10,
    username: 'john_doe',
    fullname: 'John Doe',
    email: 'john@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockDirectChatsStore = {
    entities: vi.fn().mockReturnValue([mockUser]),
    loading: vi.fn().mockReturnValue(false),
    loaded: vi.fn().mockReturnValue(true),
    loadDirectChats: vi.fn(),
    addOrUpdateChat: vi.fn(),
  };

  const mockUsersStore = {
    loadAll: vi.fn(),
    entities: vi.fn().mockReturnValue([mockUser]),
  };

  const mockDialogService = {
    open: vi.fn().mockReturnValue(of(mockUser)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [DirectChatsComponent],
      providers: [
        provideTranslateService(),
        { provide: DirectChatsStore, useValue: mockDirectChatsStore },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: TuiDialogService, useValue: mockDialogService },
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
  });

  it('should load direct chats and users on init', () => {
    expect(mockDirectChatsStore.loadDirectChats).toHaveBeenCalled();
    expect(mockUsersStore.loadAll).toHaveBeenCalled();
  });

  it('should navigate to /direct/:id when openChat is called', () => {
    (component as unknown as { openChat: (u: IUser) => void }).openChat(
      mockUser,
    );
    expect(router.navigate).toHaveBeenCalledWith(['/direct', 10]);
  });

  it('should open new chat dialog and navigate on user selection', async () => {
    await (
      component as unknown as { openNewChatDialog: () => Promise<void> }
    ).openNewChatDialog();

    expect(mockDialogService.open).toHaveBeenCalled();
    expect(mockDirectChatsStore.addOrUpdateChat).toHaveBeenCalledWith(mockUser);
    expect(router.navigate).toHaveBeenCalledWith(['/direct', 10]);
  });
});
