import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { UsersStore } from '@core/stores/users.store';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { DirectComponent } from './direct.component';
import { IUser } from '@konvoez/shared';

@Component({ selector: 'app-chat', template: '<ng-content />' })
class MockChatComponent {
  public readonly roomId = input<number | null>(null);
  public readonly recipientId = input<number | null>(null);
  public readonly title = input.required<string>();
  public readonly avatarUrl = input<string | null>(null);
}

@Component({ selector: 'app-voice-room-shell', template: '' })
class MockVoiceRoomShellComponent {
  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly headerActions = input<unknown>(null);
}

describe('DirectComponent', () => {
  let component: DirectComponent;
  let fixture: ComponentFixture<DirectComponent>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const user = {
    id: 99,
    username: 'bob',
    fullname: 'Bob',
    avatarUrl: null,
  } as IUser;

  const interlocutor = signal<IUser | null>(null);
  const isCallActive = signal(false);
  const callWithUserId = signal<number | null>(null);

  const mockDirectCallService = {
    interlocutor,
    isCallActive,
    callWithUserId: callWithUserId.asReadonly(),
    rejoinableCall: signal<{
      callId: string;
      callerId: number;
      recipientId: number;
    } | null>(null),
    initiateCall: vi.fn(),
    rejoinCall: vi.fn(),
    refreshActiveCall: vi.fn().mockResolvedValue(null),
  };

  const usersEntityMap = signal<Record<number, IUser>>({ 99: user });
  const mockUsersStore = {
    loadAll: vi.fn(),
    entityMap: usersEntityMap,
  };

  const mockVoiceLeaveService = {
    leaveActiveVoice: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: '99' }));
    interlocutor.set(null);
    isCallActive.set(false);
    callWithUserId.set(null);
    usersEntityMap.set({ 99: user });
    mockDirectCallService.rejoinableCall.set(null);

    await TestBed.configureTestingModule({
      imports: [DirectComponent],
      providers: [
        provideTranslateService(),
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
    })
      .overrideComponent(DirectComponent, {
        remove: {
          imports: [ChatComponent, VoiceRoomShellComponent],
        },
        add: {
          imports: [MockChatComponent, MockVoiceRoomShellComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DirectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create and refresh active call', () => {
    expect(component).toBeTruthy();
    expect(mockUsersStore.loadAll).toHaveBeenCalled();
    expect(mockDirectCallService.refreshActiveCall).toHaveBeenCalledWith(99);
  });

  const queryChat = (): Element | null =>
    fixture.nativeElement.querySelector('app-chat');

  const queryVoiceShell = (): Element | null =>
    fixture.nativeElement.querySelector('app-voice-room-shell');

  it('defaults to chat view and mounts chat only', () => {
    expect(component['view']()).toBe('chat');
    expect(queryChat()).toBeTruthy();
    expect(queryVoiceShell()).toBeNull();
  });

  it('mounts voice shell when callWithUserId matches route without UsersStore', () => {
    usersEntityMap.set({});
    callWithUserId.set(99);
    fixture.detectChanges();

    expect(component['view']()).toBe('call');
    expect(queryVoiceShell()).toBeTruthy();
    expect(queryChat()).toBeNull();
  });

  it('mounts voice shell only when current direct call is active', () => {
    isCallActive.set(true);
    interlocutor.set(user);
    callWithUserId.set(99);
    fixture.detectChanges();

    expect(component['view']()).toBe('call');
    expect(queryVoiceShell()).toBeTruthy();
    expect(queryChat()).toBeNull();
  });

  it('mounts chat only while preferring chat during an active call', () => {
    isCallActive.set(true);
    interlocutor.set(user);
    callWithUserId.set(99);
    fixture.detectChanges();

    component['showChat']();
    fixture.detectChanges();
    expect(component['view']()).toBe('chat');
    expect(queryChat()).toBeTruthy();
    expect(queryVoiceShell()).toBeNull();

    component['showCall']();
    fixture.detectChanges();
    expect(component['view']()).toBe('call');
    expect(queryVoiceShell()).toBeTruthy();
    expect(queryChat()).toBeNull();
  });

  it('starts a direct call', () => {
    component['startDirectCall'](user);
    expect(mockDirectCallService.initiateCall).toHaveBeenCalledWith(user);
    expect(component['preferChat']()).toBe(false);
  });

  it('does not refresh active call when route id is negative or non-numeric', () => {
    vi.clearAllMocks();
    paramMap$.next(convertToParamMap({ id: '-5' }));
    fixture.detectChanges();
    expect(mockDirectCallService.refreshActiveCall).not.toHaveBeenCalled();

    paramMap$.next(convertToParamMap({ id: 'invalid' }));
    fixture.detectChanges();
    expect(mockDirectCallService.refreshActiveCall).not.toHaveBeenCalled();
  });

  it('resets preferChat when active call ends', () => {
    isCallActive.set(true);
    interlocutor.set(user);
    callWithUserId.set(99);
    fixture.detectChanges();

    component['showChat']();
    fixture.detectChanges();
    expect(component['preferChat']()).toBe(true);

    isCallActive.set(false);
    callWithUserId.set(null);
    fixture.detectChanges();
    expect(component['preferChat']()).toBe(false);
  });
});
