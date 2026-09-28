import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as any).AudioWorkletNode = class AudioWorkletNode {};
});

import {
  EDirectCallEvent,
  EUserRole,
  EVoiceSessionType,
  IUser,
} from '@konvoez/shared';
import { DirectCallService, ECallStatus } from './direct-call.service';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { AudioService } from './audio.service';
import { VoiceRoomService } from './voice-room.service';
import { TuiNotificationService } from '@taiga-ui/core';
import { TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';

const caller = {
  id: 1,
  username: 'alice',
  fullname: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

const recipient = {
  id: 2,
  username: 'bob',
  fullname: 'Bob',
  email: 'bob@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

describe('DirectCallService', () => {
  let service: DirectCallService;
  let socket: {
    on: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    emitWithAck: ReturnType<typeof vi.fn>;
    connected: boolean;
  };
  let voiceRoomService: {
    joinSession: ReturnType<typeof vi.fn>;
    leaveSession: ReturnType<typeof vi.fn>;
    directCallTarget: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let handlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    handlers = {};
    socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      }),
      emit: vi.fn(),
      emitWithAck: vi.fn().mockResolvedValue(null),
      connected: false,
    };

    voiceRoomService = {
      joinSession: vi.fn().mockResolvedValue(undefined),
      leaveSession: vi.fn().mockResolvedValue(undefined),
      directCallTarget: vi.fn().mockReturnValue(null),
    };

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        DirectCallService,
        { provide: VoiceRoomSocketToken, useValue: socket },
        {
          provide: AudioService,
          useValue: {
            startOutgoingDialing: vi.fn(),
            stopOutgoingDialing: vi.fn(),
            startIncomingRingtone: vi.fn(),
            stopIncomingRingtone: vi.fn(),
            playCallEndSound: vi.fn(),
          },
        },
        { provide: VoiceRoomService, useValue: voiceRoomService },
        { provide: Router, useValue: router },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue({ subscribe: vi.fn() }) },
        },
        {
          provide: TranslateService,
          useValue: { instant: vi.fn((key: string) => key) },
        },
        {
          provide: Store,
          useValue: {
            selectSignal: () => () => caller,
          },
        },
      ],
    });

    service = TestBed.inject(DirectCallService);
  });

  it('cancelCall emits hangup for ringing caller and does not leave media', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CALLING,
    });

    service.cancelCall();

    expect(socket.emit).toHaveBeenCalledWith(EDirectCallEvent.CALL_HANGUP, {
      callId: 'c1',
      byUserId: caller.id,
    });
    expect(voiceRoomService.leaveSession).not.toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
  });

  it('leaveCall leaves media without emitting hangup when connected', async () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });
    voiceRoomService.directCallTarget.mockReturnValue({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });

    await service.leaveCall();

    expect(socket.emit).not.toHaveBeenCalledWith(
      EDirectCallEvent.CALL_HANGUP,
      expect.anything(),
    );
    expect(voiceRoomService.leaveSession).toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
    expect(service.rejoinableCall()?.callId).toBe('c1');
  });

  it('leaveCall clears rejoinable when CALL_ENDED arrives during leave', async () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });
    voiceRoomService.directCallTarget.mockReturnValue({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });
    voiceRoomService.leaveSession.mockImplementation(async () => {
      handlers[EDirectCallEvent.CALL_ENDED]({ callId: 'c1' });
    });

    await service.leaveCall();

    expect(service.activeCall()).toBeNull();
    expect(service.rejoinableCall()).toBeNull();
  });

  it('leaveCall cancels a ringing call', async () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CALLING,
    });

    await service.leaveCall();

    expect(socket.emit).toHaveBeenCalledWith(EDirectCallEvent.CALL_HANGUP, {
      callId: 'c1',
      byUserId: caller.id,
    });
    expect(voiceRoomService.leaveSession).not.toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
  });

  it('CALL_ENDED clears local call state', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });
    voiceRoomService.directCallTarget.mockReturnValue({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });

    handlers[EDirectCallEvent.CALL_ENDED]({ callId: 'c1' });

    expect(service.activeCall()).toBeNull();
    expect(voiceRoomService.leaveSession).toHaveBeenCalled();
  });

  it('detachFromCallWithoutHangup does not emit hangup for connected call', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });

    service.detachFromCallWithoutHangup();

    expect(socket.emit).not.toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
    expect(service.rejoinableCall()?.callId).toBe('c1');
  });
});
