import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideMockStore } from '@ngrx/store/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ERoomType,
  IRoom,
  IUserFull,
  TVoiceRoomPeerUser,
} from '@konvoez/shared';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { RoomListComponent } from './room-list.component';
import { RoomManageService } from '../room-manage.service';
import { RoomNavigationService } from '../room-navigation.service';

describe('RoomListComponent', () => {
  let fixture: ComponentFixture<RoomListComponent>;
  let component: RoomListComponent;

  const me: IUserFull = {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    fullname: 'Alice',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    twoFactorEnabled: false,
    emailVerified: true,
    pendingEmail: null,
  };

  const textRoom: IRoom = {
    id: 10,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const voiceRoom: IRoom = {
    id: 20,
    name: 'lounge',
    type: ERoomType.VOICE,
    avatar: null,
    avatarUrl: null,
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const peer = (id: number): TVoiceRoomPeerUser => ({
    id,
    username: `user${id}`,
    fullname: `User ${id}`,
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  });

  const lobby = signal<Record<number, Record<number, TVoiceRoomPeerUser>>>({});

  const mockRoomsStore = {
    textRooms: signal([textRoom]),
    voiceRooms: signal([voiceRoom]),
    loadAll: vi.fn(),
  };

  const mockRoomNavigationService = {
    selectRoom: vi.fn(),
  };

  beforeEach(async () => {
    lobby.set({});

    await TestBed.configureTestingModule({
      imports: [RoomListComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: RoomsStore, useValue: mockRoomsStore },
        {
          provide: VoiceLobbyStore,
          useValue: { roomsState: lobby },
        },
        {
          provide: RoomManageService,
          useValue: {
            canManageRooms: signal(false),
            openRoomDetails: vi.fn(),
            editRoom: vi.fn(),
            deleteRoom: vi.fn(),
          },
        },
        { provide: RoomNavigationService, useValue: mockRoomNavigationService },
        {
          provide: UnreadCountsStore,
          useValue: {
            roomMentions: signal<Record<number, number>>({}),
            roomUnreadCount: vi.fn().mockReturnValue(0),
          },
        },
        { provide: WA_IS_TOUCH, useValue: () => false },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('type', ERoomType.TEXT);
    fixture.detectChanges();
  });

  it('renders list rows with a chevron and without aside items', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-list-item')).toBeTruthy();
    expect(el.querySelector('[tuiAsideItem]')).toBeNull();
    expect(el.querySelector('tui-icon')?.getAttribute('style')).toContain(
      'chevron-right',
    );
  });

  it('exposes text rooms when type is TEXT', () => {
    expect(component['roomView'].textRooms()).toEqual([textRoom]);
  });

  it('selects a room on click', () => {
    const item: HTMLElement =
      fixture.nativeElement.querySelector('app-list-item');
    item.click();
    expect(mockRoomNavigationService.selectRoom).toHaveBeenCalledWith(textRoom);
  });

  it.each([
    { count: 0, avatars: 0, extra: null },
    { count: 1, avatars: 1, extra: null },
    { count: 2, avatars: 2, extra: null },
    { count: 5, avatars: 2, extra: '+3' },
  ])(
    'shows $avatars stacked avatars and $extra for $count peers',
    ({ count, avatars, extra }) => {
      const peers = Object.fromEntries(
        Array.from({ length: count }, (_, index) => {
          const user = peer(index + 2);
          return [user.id, user];
        }),
      );
      lobby.set({ 20: peers });
      fixture.componentRef.setInput('type', ERoomType.VOICE);
      fixture.detectChanges();

      const stack: HTMLElement | null =
        fixture.nativeElement.querySelector('tui-avatar-stack');
      if (avatars === 0) {
        expect(stack).toBeNull();
        return;
      }
      expect(stack?.querySelectorAll('app-user-avatar').length).toBe(avatars);
      const extraNode = stack?.querySelector('div[tuiAvatar]');
      if (extra) {
        expect(extraNode?.textContent?.trim()).toBe(extra);
      } else {
        expect(extraNode).toBeNull();
      }
      expect(fixture.nativeElement.querySelector('app-room-peer')).toBeNull();
    },
  );
});
