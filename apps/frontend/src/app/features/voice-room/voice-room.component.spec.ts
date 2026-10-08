import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RoomsStore } from '@core/stores/rooms.store';
import { EVoiceSessionType } from '@konvoez/shared';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceRoomComponent } from './voice-room.component';
import { IRoom } from '@konvoez/shared';
import { RoomManageService } from '../rooms/room-manage.service';

describe('VoiceRoomComponent', () => {
  let paramMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let selectedRoomId: ReturnType<typeof signal<number | null>>;
  let joinSession: ReturnType<typeof vi.fn>;
  let reportJoinFailure: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let joiningTarget: ReturnType<typeof signal<unknown>>;

  beforeEach(() => {
    paramMap = new BehaviorSubject(convertToParamMap({ id: '4' }));
    selectedRoomId = signal<number | null>(null);
    joinSession = vi.fn().mockResolvedValue(undefined);
    reportJoinFailure = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);
    joiningTarget = signal(null);

    TestBed.configureTestingModule({
      imports: [VoiceRoomComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap },
        },
        {
          provide: Router,
          useValue: { navigate },
        },
        {
          provide: RoomsStore,
          useValue: {
            roomsDict: signal<Record<number, IRoom>>({
              4: { id: 4, name: 'VIP', avatarUrl: '' } as IRoom,
            }),
          },
        },
        {
          provide: VoiceSessionStore,
          useValue: {
            selectedRoomId: selectedRoomId.asReadonly(),
          },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            joinSession,
            reportJoinFailure,
            joiningTarget: joiningTarget.asReadonly(),
          },
        },
        {
          provide: RoomManageService,
          useValue: {
            canManageRooms: signal(false).asReadonly(),
            editRoom: vi.fn(),
            deleteRoom: vi.fn(),
          },
        },
      ],
    });
    TestBed.overrideComponent(VoiceRoomComponent, {
      set: {
        imports: [],
        template: `<p class="room-name">{{ room()?.name }}</p>`,
      },
    });
  });

  const create = () => {
    const fixture = TestBed.createComponent(VoiceRoomComponent);
    fixture.detectChanges();
    TestBed.flushEffects();
    return fixture;
  };

  it('joins the route room once', async () => {
    const fixture = create();
    expect(fixture.nativeElement.querySelector('.room-name')?.textContent).toBe(
      'VIP',
    );
    expect(joinSession).toHaveBeenCalledTimes(1);
    expect(joinSession).toHaveBeenCalledWith({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 4,
    });

    selectedRoomId.set(9);
    TestBed.flushEffects();
    expect(joinSession).toHaveBeenCalledTimes(1);

    fixture.componentInstance['onLeft']();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('skips join when that room is already selected', () => {
    selectedRoomId.set(4);
    create();
    expect(joinSession).not.toHaveBeenCalled();
  });

  it('skips join while the same room join is already in flight', () => {
    joiningTarget.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 4,
    });
    create();
    expect(joinSession).not.toHaveBeenCalled();
  });

  it('reports a failed join', async () => {
    const error = new Error('join failed');
    joinSession.mockRejectedValue(error);
    create();
    await vi.waitFor(() => {
      expect(reportJoinFailure).toHaveBeenCalledWith(error);
    });
  });
});
