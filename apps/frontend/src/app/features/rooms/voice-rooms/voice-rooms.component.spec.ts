import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideMockStore } from '@ngrx/store/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ERoomType } from '@konvoez/shared';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { LayoutService } from '@core/services/layout.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { RoomNavigationService } from '../room-navigation.service';
import { VoiceRoomsComponent } from './voice-rooms.component';
import { RoomManageService } from '../room-manage.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';

describe('VoiceRoomsComponent', () => {
  let fixture: ComponentFixture<VoiceRoomsComponent>;
  let component: VoiceRoomsComponent;

  const mockRoomManageService = {
    canManageRooms: signal(true),
    createRoom: vi.fn().mockResolvedValue(undefined),
  };

  const mockRoomsStore = {
    textRooms: signal([]),
    voiceRooms: signal([]),
    loadAll: vi.fn(),
  };

  const mockVoiceLobbyStore = {
    roomsState: signal({}),
  };

  const mockUnreadCountsStore = {
    roomMentions: signal<Record<number, number>>({}),
    roomUnreadCount: vi.fn().mockReturnValue(0),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoiceRoomsComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: null }],
        }),
        { provide: RoomManageService, useValue: mockRoomManageService },
        { provide: RoomsStore, useValue: mockRoomsStore },
        { provide: VoiceLobbyStore, useValue: mockVoiceLobbyStore },
        { provide: UnreadCountsStore, useValue: mockUnreadCountsStore },
        { provide: LayoutService, useValue: { isNarrow: signal(false) } },
        {
          provide: VoiceSessionService,
          useValue: {
            moveMember: vi.fn(),
            disconnectMember: vi.fn(),
          },
        },
        { provide: RoomNavigationService, useValue: { selectRoom: vi.fn() } },
        { provide: UserDialogService, useValue: { open: vi.fn() } },
        { provide: WA_IS_TOUCH, useValue: () => false },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false),
            speakerMuted: signal(false),
          },
        },
        {
          provide: AudioActivityService,
          useValue: { speakingMap: signal({}) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            firstChild: null,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VoiceRoomsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component with child route false by default', () => {
    expect(component).toBeTruthy();
    expect(component['hasChildRoute']()).toBe(false);
  });

  it('calls roomManageService.createRoom with VOICE type', () => {
    component['createRoom']();
    expect(mockRoomManageService.createRoom).toHaveBeenCalledWith(
      ERoomType.VOICE,
    );
  });
});
