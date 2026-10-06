import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { EUserRole, EVoiceSessionType, IUser } from '@konvoez/shared';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { beforeEach, describe, expect, it } from 'vitest';
import { VoiceSessionPeersService } from './voice-session-peers.service';

const user = (id: number, username: string): IUser =>
  ({
    id,
    username,
    fullname: username,
    email: `${username}@example.com`,
    role: EUserRole.MEMBER,
    createdAt: new Date(),
  }) as IUser;

describe('VoiceSessionPeersService', () => {
  const me = signal<IUser | null>(user(1, 'me'));
  const remotePeers = signal<IUser[]>([]);
  const activeSession = signal<
    | { type: EVoiceSessionType.GROUP_ROOM; roomId: number }
    | {
        type: EVoiceSessionType.DIRECT_CALL;
        callId: string;
        interlocutorId: number;
      }
    | null
  >(null);
  const interlocutor = signal<IUser | null>(null);
  const isCalling = signal(false);
  const isIncoming = signal(false);

  beforeEach(() => {
    me.set(user(1, 'me'));
    remotePeers.set([]);
    activeSession.set(null);
    interlocutor.set(null);
    isCalling.set(false);
    isIncoming.set(false);

    TestBed.configureTestingModule({
      providers: [
        VoiceSessionPeersService,
        {
          provide: Store,
          useValue: { selectSignal: () => me.asReadonly() },
        },
        {
          provide: VoiceRoomStore,
          useValue: {
            peersList: remotePeers.asReadonly(),
            activeSession: activeSession.asReadonly(),
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            interlocutor: interlocutor.asReadonly(),
            isCalling: isCalling.asReadonly(),
            isIncoming: isIncoming.asReadonly(),
          },
        },
      ],
    });
  });

  const service = () => TestBed.inject(VoiceSessionPeersService);

  it('lists the room peers and their count', () => {
    remotePeers.set([user(3, 'groupie')]);
    activeSession.set({ type: EVoiceSessionType.GROUP_ROOM, roomId: 10 });

    expect(
      service()
        .peers()
        .map((peer) => peer.id),
    ).toEqual([1, 3]);
    expect(service().count()).toBe(2);
  });

  it('includes a ringing interlocutor before a session exists', () => {
    interlocutor.set(user(2, 'other'));
    isCalling.set(true);

    expect(
      service()
        .peers()
        .map((peer) => peer.id),
    ).toEqual([1, 2]);
    expect(service().count()).toBe(2);
  });
});
