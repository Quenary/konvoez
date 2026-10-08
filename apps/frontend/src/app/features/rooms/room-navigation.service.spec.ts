import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { ERoomType, EVoiceSessionType, IRoom } from '@konvoez/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomNavigationService } from './room-navigation.service';

describe('RoomNavigationService', () => {
  let service: RoomNavigationService;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let voiceSessionService: {
    joinSession: ReturnType<typeof vi.fn>;
    reportJoinFailure: ReturnType<typeof vi.fn>;
  };
  let voiceSessionSelectedRoomId: ReturnType<typeof vi.fn>;

  const textRoom: IRoom = {
    id: 10,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
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
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };
    voiceSessionService = {
      joinSession: vi.fn().mockResolvedValue(undefined),
      reportJoinFailure: vi.fn(),
    };
    voiceSessionSelectedRoomId = vi.fn().mockReturnValue(null);

    TestBed.configureTestingModule({
      providers: [
        RoomNavigationService,
        { provide: Router, useValue: router },
        { provide: VoiceSessionService, useValue: voiceSessionService },
        {
          provide: VoiceSessionStore,
          useValue: {
            selectedRoomId: voiceSessionSelectedRoomId,
          },
        },
      ],
    });

    service = TestBed.inject(RoomNavigationService);
  });

  it('selects a text room and navigates', () => {
    service.selectRoom(textRoom);

    expect(router.navigate).toHaveBeenCalledWith([`/text-room/${textRoom.id}`]);
    expect(voiceSessionService.joinSession).not.toHaveBeenCalled();
  });

  it('joins and navigates when selecting a different voice room', () => {
    voiceSessionSelectedRoomId.mockReturnValue(99);

    service.selectRoom(voiceRoom);

    expect(voiceSessionService.joinSession).toHaveBeenCalledWith({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: voiceRoom.id,
    });
    expect(router.navigate).toHaveBeenCalledWith([
      `/voice-room/${voiceRoom.id}`,
    ]);
  });

  it('does not rejoin when voice session is already in the room', () => {
    voiceSessionSelectedRoomId.mockReturnValue(voiceRoom.id);

    service.selectRoom(voiceRoom);

    expect(voiceSessionService.joinSession).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith([
      `/voice-room/${voiceRoom.id}`,
    ]);
  });

  it('navigates home when room is null', () => {
    service.selectRoom(null);

    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
