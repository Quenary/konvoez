import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { UsersStore } from '@features/users/users.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { DirectComponent } from './direct.component';
import { EVoiceSessionType, IUser } from '@konvoez/shared';

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

  const user = {
    id: 99,
    username: 'bob',
    fullname: 'Bob',
    avatarUrl: null,
  } as IUser;

  const mockDirectCallService = {
    interlocutor: signal<IUser | null>(null),
    isCallActive: signal(false),
    rejoinableCall: signal<{
      callId: string;
      callerId: number;
      recipientId: number;
    } | null>(null),
    initiateCall: vi.fn(),
    rejoinCall: vi.fn(),
    refreshActiveCall: vi.fn().mockResolvedValue(null),
  };

  const mockVoiceSessionStore = {
    activeSession: signal<{
      type: EVoiceSessionType;
      interlocutorId?: number;
    } | null>(null),
  };

  const mockUsersStore = {
    loadAll: vi.fn(),
    entityMap: signal<Record<number, IUser>>({ 99: user }),
  };

  const mockVoiceLeaveService = {
    leaveActiveVoice: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDirectCallService.interlocutor.set(null);
    mockDirectCallService.isCallActive.set(false);
    mockDirectCallService.rejoinableCall.set(null);
    mockVoiceSessionStore.activeSession.set(null);

    await TestBed.configureTestingModule({
      imports: [DirectComponent],
      providers: [
        provideTranslateService(),
        { provide: DirectCallService, useValue: mockDirectCallService },
        { provide: VoiceSessionStore, useValue: mockVoiceSessionStore },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: VoiceLeaveService, useValue: mockVoiceLeaveService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: '99' })),
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

  it('mounts voice shell only when current direct call is active', () => {
    mockDirectCallService.isCallActive.set(true);
    mockDirectCallService.interlocutor.set(user);
    fixture.detectChanges();

    expect(component['view']()).toBe('call');
    expect(queryVoiceShell()).toBeTruthy();
    expect(queryChat()).toBeNull();
  });

  it('mounts chat only while preferring chat during an active call', () => {
    mockDirectCallService.isCallActive.set(true);
    mockDirectCallService.interlocutor.set(user);
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
});
