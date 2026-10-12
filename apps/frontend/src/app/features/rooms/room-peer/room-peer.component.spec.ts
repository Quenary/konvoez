import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { EUserRole, IVoiceRoomPeerUser } from '@konvoez/shared';
import { TuiAsideComponent } from '@taiga-ui/layout';
import { RoomPeerComponent } from './room-peer.component';

const makePeer = (
  id: number,
  overrides?: Partial<IVoiceRoomPeerUser>,
): IVoiceRoomPeerUser => ({
  id,
  username: `user${id}`,
  fullname: `User ${id}`,
  email: `user${id}@example.com`,
  role: EUserRole.MEMBER,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('RoomPeerComponent', () => {
  let currentUser: ReturnType<typeof signal<IVoiceRoomPeerUser | null>>;
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

  it('renders username and no status icons when peer is active', () => {
    const fixture = TestBed.createComponent(RoomPeerComponent);
    fixture.componentRef.setInput('peer', makePeer(2));
    fixture.detectChanges();

    const nameEl = fixture.nativeElement.querySelector('.peer-name');
    expect(nameEl?.textContent?.trim()).toBe('user2');
    expect(fixture.nativeElement.querySelector('.status-icons')).toBeNull();
  });

  it('displays mic-off icon when remote peer is muted', () => {
    const fixture = TestBed.createComponent(RoomPeerComponent);
    fixture.componentRef.setInput('peer', makePeer(2, { muted: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance['isMuted']()).toBe(true);
    expect(fixture.componentInstance['isDeafened']()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('tui-icon[iconStart="@tui.mic-off"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        'tui-icon[iconStart="@tui.headphone-off"]',
      ),
    ).toBeNull();
  });

  it('displays headphone-off icon when remote peer is deafened', () => {
    const fixture = TestBed.createComponent(RoomPeerComponent);
    fixture.componentRef.setInput('peer', makePeer(2, { deafened: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance['isDeafened']()).toBe(true);
    expect(
      fixture.nativeElement.querySelector(
        'tui-icon[iconStart="@tui.headphone-off"]',
      ),
    ).not.toBeNull();
  });

  it('displays both mic-off and headphone-off icons when remote peer is muted and deafened', () => {
    const fixture = TestBed.createComponent(RoomPeerComponent);
    fixture.componentRef.setInput(
      'peer',
      makePeer(2, { muted: true, deafened: true }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance['isMuted']()).toBe(true);
    expect(fixture.componentInstance['isDeafened']()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('tui-icon[iconStart="@tui.mic-off"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        'tui-icon[iconStart="@tui.headphone-off"]',
      ),
    ).not.toBeNull();
  });

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
      fixture.nativeElement.querySelector('tui-icon[iconStart="@tui.mic-off"]'),
    ).not.toBeNull();

    speakerMuted.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance['isDeafened']()).toBe(true);
    expect(
      fixture.nativeElement.querySelector(
        'tui-icon[iconStart="@tui.headphone-off"]',
      ),
    ).not.toBeNull();
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
