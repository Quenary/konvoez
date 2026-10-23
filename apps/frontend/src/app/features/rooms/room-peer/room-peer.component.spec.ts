import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { TVoiceRoomPeerUser } from '@konvoez/shared';
import { TuiAsideComponent } from '@taiga-ui/layout';
import { RoomPeerComponent } from './room-peer.component';
const makePeer = (
  id: number,
  overrides?: Partial<TVoiceRoomPeerUser>,
): TVoiceRoomPeerUser => ({
  id,
  username: `user${id}`,
  fullname: `User ${id}`,
  email: `user${id}@example.com`,
  isOwner: false,
  roles: [],
  permissions: [],
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('RoomPeerComponent', () => {
  let currentUser: ReturnType<typeof signal<TVoiceRoomPeerUser | null>>;
  let microphoneMuted: ReturnType<typeof signal<boolean>>;
  let speakerMuted: ReturnType<typeof signal<boolean>>;
  let speakingMap: ReturnType<typeof signal<Record<number, boolean>>>;

  beforeEach(() => {
    currentUser = signal(makePeer(1));
    microphoneMuted = signal(false);
    speakerMuted = signal(false);
    speakingMap = signal({});

    TestBed.configureTestingModule({
      imports: [RoomPeerComponent],
      providers: [
        provideTranslateService(),
        {
          provide: Store,
          useValue: {
            selectSignal: () => currentUser.asReadonly(),
          },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: microphoneMuted.asReadonly(),
            speakerMuted: speakerMuted.asReadonly(),
          },
        },
        {
          provide: AudioActivityService,
          useValue: {
            speakingMap: speakingMap.asReadonly(),
          },
        },
        {
          provide: TuiAsideComponent,
          useValue: {
            expanded: signal(true),
          },
        },
      ],
    });
  });

  it.each([
    {
      description: 'active (unmuted and undeafened)',
      peerOverrides: {},
      expectMuted: false,
      expectDeafened: false,
      expectMicOff: false,
      expectHeadphoneOff: false,
    },
    {
      description: 'muted only',
      peerOverrides: { muted: true },
      expectMuted: true,
      expectDeafened: false,
      expectMicOff: true,
      expectHeadphoneOff: false,
    },
    {
      description: 'deafened only',
      peerOverrides: { deafened: true },
      expectMuted: false,
      expectDeafened: true,
      expectMicOff: false,
      expectHeadphoneOff: true,
    },
    {
      description: 'both muted and deafened',
      peerOverrides: { muted: true, deafened: true },
      expectMuted: true,
      expectDeafened: true,
      expectMicOff: true,
      expectHeadphoneOff: true,
    },
  ])(
    'displays expected status icons when remote peer is $description',
    ({
      peerOverrides,
      expectMuted,
      expectDeafened,
      expectMicOff,
      expectHeadphoneOff,
    }) => {
      const fixture = TestBed.createComponent(RoomPeerComponent);
      fixture.componentRef.setInput('peer', makePeer(2, peerOverrides));
      fixture.detectChanges();

      expect(fixture.componentInstance['isMuted']()).toBe(expectMuted);
      expect(fixture.componentInstance['isDeafened']()).toBe(expectDeafened);

      const statusIcons = fixture.nativeElement.querySelectorAll(
        '.status-icons tui-icon',
      );

      if (expectMicOff) {
        expect(statusIcons.length).toBeGreaterThan(0);
      }

      if (expectHeadphoneOff) {
        expect(statusIcons.length).toBe(
          expectMicOff && expectHeadphoneOff ? 2 : 1,
        );
      } else if (!expectMicOff) {
        expect(statusIcons.length).toBe(0);
      } else {
        expect(statusIcons.length).toBe(1);
      }

      if (!expectMicOff && !expectHeadphoneOff) {
        expect(fixture.nativeElement.querySelector('.status-icons')).toBeNull();
      }
    },
  );

  it('uses local audio preferences for local peer', () => {
    const fixture = TestBed.createComponent(RoomPeerComponent);
    fixture.componentRef.setInput(
      'peer',
      makePeer(1, { muted: false, deafened: false }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance['isMuted']()).toBe(false);
    expect(fixture.componentInstance['isDeafened']()).toBe(false);
    expect(fixture.nativeElement.querySelector('.status-icons')).toBeNull();

    microphoneMuted.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance['isMuted']()).toBe(true);
    expect(
      fixture.nativeElement.querySelectorAll('.status-icons tui-icon').length,
    ).toBe(1);

    speakerMuted.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance['isDeafened']()).toBe(true);
    expect(
      fixture.nativeElement.querySelectorAll('.status-icons tui-icon').length,
    ).toBe(2);
  });

  it('detects when peer is speaking', () => {
    const fixture = TestBed.createComponent(RoomPeerComponent);
    fixture.componentRef.setInput('peer', makePeer(2));
    fixture.detectChanges();

    expect(fixture.componentInstance['isSpeaking']()).toBe(false);

    speakingMap.set({ 2: true });
    fixture.detectChanges();

    expect(fixture.componentInstance['isSpeaking']()).toBe(true);
  });
});
