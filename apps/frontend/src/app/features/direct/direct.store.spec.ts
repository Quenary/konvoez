import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { provideStore } from '@ngrx/store';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { UsersStore } from '@core/stores/users.store';
import { IUser } from '@konvoez/shared';
import { DirectStore } from './direct.store';

describe('DirectStore', () => {
  let store: InstanceType<typeof DirectStore>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const mockUser: IUser = {
    id: 99,
    username: 'bob',
    fullname: 'Bob',
    avatarUrl: 'https://example.com/avatar.png',
  } as IUser;

  const interlocutor = signal<IUser | null>(null);
  const isCallActive = signal(false);
  const callWithUserId = signal<number | null>(null);
  const rejoinableCall = signal<{
    callId: string;
    callerId: number;
    recipientId: number;
  } | null>(null);

  const mockDirectCallService = {
    interlocutor,
    isCallActive,
    callWithUserId: callWithUserId.asReadonly(),
    rejoinableCall,
    initiateCall: vi.fn(),
    rejoinCall: vi.fn(),
    refreshActiveCall: vi.fn().mockResolvedValue(null),
  };

  const usersEntityMap = signal<Record<number, IUser>>({ 99: mockUser });
  const usersOnlineMap = signal<Record<number, boolean>>({});
  const mockUsersStore = {
    loadAll: vi.fn(),
    entityMap: usersEntityMap,
    onlineMap: usersOnlineMap,
  };

  const mockVoiceLeaveService = {
    leaveActiveVoice: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: '99' }));
    interlocutor.set(null);
    isCallActive.set(false);
    callWithUserId.set(null);
    rejoinableCall.set(null);
    usersEntityMap.set({ 99: mockUser });
    usersOnlineMap.set({});

    TestBed.configureTestingModule({
      providers: [
        DirectStore,
        provideTranslateService(),
        provideStore({
          auth: () => ({ user: { id: 1, username: 'alice' } }),
        }),
        { provide: DirectCallService, useValue: mockDirectCallService },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: VoiceLeaveService, useValue: mockVoiceLeaveService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$,
          },
        },
      ],
    });

    store = TestBed.inject(DirectStore);
    TestBed.flushEffects();
  });

  describe('presentation fields', () => {
    it.each([
      {
        scenario: 'regular user chat',
        recipientId: '99',
        users: { 99: mockUser } as Record<number, IUser>,
        expectedIsSelf: false,
        expectedTitle: 'bob',
        expectedAvatarUrl: 'https://example.com/avatar.png',
        expectedAvatarIcon: null,
      },
      {
        scenario: 'saved messages (self chat)',
        recipientId: '1',
        users: {
          1: {
            id: 1,
            username: 'alice',
            fullname: 'Alice',
            avatarUrl: 'https://example.com/alice.png',
          } as IUser,
        } as Record<number, IUser>,
        expectedIsSelf: true,
        expectedTitle: 'DIRECT.SAVED_MESSAGES',
        expectedAvatarUrl: null,
        expectedAvatarIcon: '@tui.bookmark',
      },
      {
        scenario: 'user not found in UsersStore',
        recipientId: '42',
        users: {} as Record<number, IUser>,
        expectedIsSelf: false,
        expectedTitle: '',
        expectedAvatarUrl: null,
        expectedAvatarIcon: null,
      },
    ])(
      'computes presentation for $scenario',
      ({
        recipientId,
        users,
        expectedIsSelf,
        expectedTitle,
        expectedAvatarUrl,
        expectedAvatarIcon,
      }) => {
        usersEntityMap.set(users);
        paramMap$.next(convertToParamMap({ id: recipientId }));
        TestBed.flushEffects();

        expect(store.isSelf()).toBe(expectedIsSelf);
        expect(store.title()).toBe(expectedTitle);
        expect(store.avatarUrl()).toBe(expectedAvatarUrl);
        expect(store.avatarIcon()).toBe(expectedAvatarIcon);
      },
    );
  });

  describe('call state matrix', () => {
    it.each([
      {
        scenario: 'idle regular chat without active or rejoinable call',
        recipientId: '99',
        activeCallUserId: null,
        rejoinable: null,
        expectedActive: false,
        expectedCanRejoin: false,
        expectedView: 'chat' as const,
      },
      {
        scenario: 'active call with current interlocutor',
        recipientId: '99',
        activeCallUserId: 99,
        rejoinable: null,
        expectedActive: true,
        expectedCanRejoin: false,
        expectedView: 'call' as const,
      },
      {
        scenario: 'active call with another user',
        recipientId: '99',
        activeCallUserId: 50,
        rejoinable: null,
        expectedActive: false,
        expectedCanRejoin: false,
        expectedView: 'chat' as const,
      },
      {
        scenario: 'rejoinable call with current interlocutor',
        recipientId: '99',
        activeCallUserId: null,
        rejoinable: { callId: 'c1', callerId: 1, recipientId: 99 },
        expectedActive: false,
        expectedCanRejoin: true,
        expectedView: 'chat' as const,
      },
      {
        scenario: 'rejoinable call with another user',
        recipientId: '99',
        activeCallUserId: null,
        rejoinable: { callId: 'c1', callerId: 1, recipientId: 50 },
        expectedActive: false,
        expectedCanRejoin: false,
        expectedView: 'chat' as const,
      },
      {
        scenario: 'saved messages ignores active call with own id',
        recipientId: '1',
        activeCallUserId: 1,
        rejoinable: null,
        expectedActive: false,
        expectedCanRejoin: false,
        expectedView: 'chat' as const,
      },
      {
        scenario: 'saved messages suppresses rejoinable call',
        recipientId: '1',
        activeCallUserId: null,
        rejoinable: { callId: 'c1', callerId: 1, recipientId: 1 },
        expectedActive: false,
        expectedCanRejoin: false,
        expectedView: 'chat' as const,
      },
    ])(
      '$scenario',
      ({
        recipientId,
        activeCallUserId,
        rejoinable,
        expectedActive,
        expectedCanRejoin,
        expectedView,
      }) => {
        paramMap$.next(convertToParamMap({ id: recipientId }));
        callWithUserId.set(activeCallUserId);
        rejoinableCall.set(rejoinable);
        TestBed.flushEffects();

        expect(store.isCurrentDirectCallActive()).toBe(expectedActive);
        expect(store.canRejoinCall()).toBe(expectedCanRejoin);
        expect(store.view()).toBe(expectedView);
      },
    );
  });

  describe('lifecycle, toggle and actions', () => {
    it('initializes from route param and loads users', () => {
      expect(mockUsersStore.loadAll).toHaveBeenCalled();
      expect(store.recipientId()).toBe(99);
      expect(mockDirectCallService.refreshActiveCall).toHaveBeenCalledWith(99);
    });

    it('does not refresh active call for saved messages', () => {
      vi.clearAllMocks();
      paramMap$.next(convertToParamMap({ id: '1' }));
      TestBed.flushEffects();

      expect(mockDirectCallService.refreshActiveCall).not.toHaveBeenCalled();
    });

    it('toggles view between call and chat via showChat and showCall', () => {
      callWithUserId.set(99);
      TestBed.flushEffects();
      expect(store.view()).toBe('call');

      store.showChat();
      TestBed.flushEffects();
      expect(store.preferChat()).toBe(true);
      expect(store.view()).toBe('chat');

      store.showCall();
      TestBed.flushEffects();
      expect(store.preferChat()).toBe(false);
      expect(store.view()).toBe('call');
    });

    it('resets preferChat when active call ends', () => {
      callWithUserId.set(99);
      TestBed.flushEffects();

      store.showChat();
      TestBed.flushEffects();
      expect(store.preferChat()).toBe(true);

      callWithUserId.set(null);
      TestBed.flushEffects();
      expect(store.preferChat()).toBe(false);
    });

    it('delegates call actions to directCallService and voiceLeaveService', () => {
      store.startDirectCall(mockUser);
      expect(mockDirectCallService.initiateCall).toHaveBeenCalledWith(mockUser);
      expect(store.preferChat()).toBe(false);

      rejoinableCall.set({
        callId: 'call-1',
        callerId: 1,
        recipientId: 99,
      });
      store.showChat();
      store.rejoinDirectCall(mockUser);
      expect(mockDirectCallService.rejoinCall).toHaveBeenCalledWith(
        { callId: 'call-1', callerId: 1, recipientId: 99 },
        mockUser,
      );
      expect(store.preferChat()).toBe(false);

      store.hangup();
      expect(mockVoiceLeaveService.leaveActiveVoice).toHaveBeenCalled();
    });

    it('computes isOnline as true when direct user is in onlineMap', () => {
      usersOnlineMap.set({ 99: true });
      expect(store.isOnline()).toBe(true);
    });

    it('computes isOnline as false when direct user is offline', () => {
      usersOnlineMap.set({});
      expect(store.isOnline()).toBe(false);
    });

    it('computes isOnline as false for self chat even if in onlineMap', () => {
      usersOnlineMap.set({ 1: true });
      paramMap$.next(convertToParamMap({ id: '1' }));
      expect(store.isSelf()).toBe(true);
      expect(store.isOnline()).toBe(false);
    });
  });
});
