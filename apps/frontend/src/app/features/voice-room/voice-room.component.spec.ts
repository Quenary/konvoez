import { TestBed } from '@angular/core/testing';
import { Component, input, output, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RoomsStore } from '@core/stores/rooms.store';
import { EVoiceSessionType } from '@konvoez/shared';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceRoomComponent } from './voice-room.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { RoomContextMenuComponent } from '../rooms/room-context-menu/room-context-menu.component';
import { IRoom } from '@konvoez/shared';
import { RoomManageService } from '../rooms/room-manage.service';

@Component({ selector: 'app-voice-room-shell', template: '' })
class MockVoiceRoomShellComponent {
  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly headerActions = input<unknown>(null);
  public readonly left = output<void>();
}

describe('VoiceRoomComponent', () => {
  let paramMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let selectedRoomId: ReturnType<typeof signal<number | null>>;
  let joinSession: ReturnType<typeof vi.fn>;
  let reportJoinFailure: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let joiningTarget: ReturnType<typeof signal<unknown>>;
  let roomClosed$: Subject<{ roomId: number }>;

  beforeEach(() => {
    paramMap = new BehaviorSubject(convertToParamMap({ id: '4' }));
    selectedRoomId = signal<number | null>(null);
    joinSession = vi.fn().mockResolvedValue(undefined);
    reportJoinFailure = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);
    joiningTarget = signal(null);
    roomClosed$ = new Subject();

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
            roomClosed$: roomClosed$.asObservable(),
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

  it('navigates home when the closed room matches the route', () => {
    create();
    navigate.mockClear();
    roomClosed$.next({ roomId: 4 });
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('does not navigate when a different room was closed', () => {
    create();
    navigate.mockClear();
    roomClosed$.next({ roomId: 99 });
    expect(navigate).not.toHaveBeenCalled();
  });

  describe('shell instance stability', () => {
    let roomsDictSignal: ReturnType<typeof signal<Record<number, IRoom>>>;

    beforeEach(async () => {
      roomsDictSignal = signal<Record<number, IRoom>>({});

      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [VoiceRoomComponent],
        providers: [
          provideTranslateService(),
          {
            provide: ActivatedRoute,
            useValue: { paramMap: of(convertToParamMap({ id: '4' })) },
          },
          {
            provide: Router,
            useValue: { navigate: vi.fn() },
          },
          {
            provide: RoomsStore,
            useValue: { roomsDict: roomsDictSignal },
          },
          {
            provide: VoiceSessionStore,
            useValue: { selectedRoomId: signal(4).asReadonly() },
          },
          {
            provide: VoiceSessionService,
            useValue: {
              joinSession: vi.fn().mockResolvedValue(undefined),
              reportJoinFailure: vi.fn(),
              joiningTarget: signal(null).asReadonly(),
              roomClosed$: of(),
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
      })
        .overrideComponent(VoiceRoomComponent, {
          remove: {
            imports: [VoiceRoomShellComponent, RoomContextMenuComponent],
          },
          add: {
            imports: [MockVoiceRoomShellComponent],
          },
        })
        .compileComponents();
    });

    it('keeps the same shell instance after room() changes from null to a value', () => {
      const fixture = TestBed.createComponent(VoiceRoomComponent);
      fixture.detectChanges();

      const shellBefore = fixture.debugElement.query(
        By.directive(MockVoiceRoomShellComponent),
      )?.componentInstance as MockVoiceRoomShellComponent;
      expect(shellBefore).toBeTruthy();
      expect(shellBefore.title()).toBe('');

      roomsDictSignal.set({
        4: { id: 4, name: 'VIP', avatarUrl: 'http://avatar' } as IRoom,
      });
      fixture.detectChanges();

      const shellAfter = fixture.debugElement.query(
        By.directive(MockVoiceRoomShellComponent),
      )?.componentInstance as MockVoiceRoomShellComponent;
      expect(shellAfter).toBe(shellBefore);
      expect(shellAfter.title()).toBe('VIP');
      expect(shellAfter.avatarUrl()).toBe('http://avatar');
    });
  });
});
