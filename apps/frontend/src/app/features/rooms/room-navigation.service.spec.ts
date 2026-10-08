import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { ERoomType, EVoiceSessionType, IRoom } from '@konvoez/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomNavigationService } from './room-navigation.service';

describe('RoomNavigationService', () => {
  let service: RoomNavigationService;
  let roomsStore: {
    setSelectedRoomId: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn>; url: string };
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
    roomsStore = {
      setSelectedRoomId: vi.fn(),
    };
    router = {
      navigate: vi.fn().mockResolvedValue(true),
      url: '/',
    };
    voiceSessionService = {
      joinSession: vi.fn().mockResolvedValue(undefined),
      reportJoinFailure: vi.fn(),
    };
    voiceSessionSelectedRoomId = vi.fn().mockReturnValue(null);

    TestBed.configureTestingModule({
      providers: [
        RoomNavigationService,
        { provide: RoomsStore, useValue: roomsStore },
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

    expect(roomsStore.setSelectedRoomId).toHaveBeenCalledWith(textRoom.id);
    expect(router.navigate).toHaveBeenCalledWith([`/text-room/${textRoom.id}`]);
    expect(voiceSessionService.joinSession).not.toHaveBeenCalled();
  });

  it('joins and navigates when selecting a different voice room', () => {
    voiceSessionSelectedRoomId.mockReturnValue(99);

    service.selectRoom(voiceRoom);

    expect(roomsStore.setSelectedRoomId).toHaveBeenCalledWith(voiceRoom.id);
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

  it('navigates home when viewing a voice room page that was closed', () => {
    router.url = `/voice-room/${voiceRoom.id}`;

    service.leaveVoiceRoomPageIfViewing(voiceRoom.id);

    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('does not navigate when the closed room is not the current voice page', () => {
    router.url = `/voice-room/${voiceRoom.id}`;

    service.leaveVoiceRoomPageIfViewing(99);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate away from non-voice routes when a room closes', () => {
    router.url = '/settings';

    service.leaveVoiceRoomPageIfViewing(voiceRoom.id);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates home when room is null', () => {
    service.selectRoom(null);

    expect(roomsStore.setSelectedRoomId).toHaveBeenCalledWith(null);
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
