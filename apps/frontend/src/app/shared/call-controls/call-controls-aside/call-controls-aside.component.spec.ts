import { ComponentRef, TemplateRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceQualityService } from '@core/services/voice-quality.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { RoomNavigationService } from '@features/rooms/room-navigation.service';
import { EVoiceQualityTier, EVoiceSessionType, IRoom } from '@konvoez/shared';
import { TuiHintDirective } from '@taiga-ui/core/portals';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallControlsAsideComponent } from './call-controls-aside.component';

describe('CallControlsAsideComponent', () => {
  let roomsDict: ReturnType<typeof signal<Record<number, IRoom>>>;
  let activeSession: ReturnType<
    typeof signal<{ type: EVoiceSessionType; roomId: number } | null>
  >;
  let translate: TranslateService;

  beforeEach(() => {
    roomsDict = signal({});
    activeSession = signal(null);

    TestBed.configureTestingModule({
      imports: [CallControlsAsideComponent],
      providers: [
        provideTranslateService(),
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: RoomNavigationService, useValue: { selectRoom: vi.fn() } },
        {
          provide: VoiceLeaveService,
          useValue: { leaveFromVoiceUi: vi.fn() },
        },
        {
          provide: VoiceSessionService,
          useValue: { stopCamera: vi.fn(), stopScreen: vi.fn() },
        },
        {
          provide: VoiceQualityService,
          useValue: {
            tier: signal(EVoiceQualityTier.EXCELLENT),
            bitrateKbps: signal(64),
          },
        },
        {
          provide: VoiceConnectionStore,
          useValue: {
            state: signal(null),
            audioSuspended: signal(false),
          },
        },
        {
          provide: RoomsStore,
          useValue: { roomsDict: roomsDict.asReadonly() },
        },
        {
          provide: VoiceSessionStore,
          useValue: { activeSession: activeSession.asReadonly() },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false),
            speakerMuted: signal(false),
            toggleMicrophoneMuted: vi.fn(),
            toggleSpeakerMuted: vi.fn(),
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            isDirectCallContext: signal(false),
            isConnected: signal(false),
            callWithUserId: signal(null),
            interlocutor: signal(null),
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: signal(null),
            localScreenTrack: signal(null),
          },
        },
      ],
    });

    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      CALL: {
        QUALITY: {
          LEVEL_0: 'Voice quality: excellent. {{kbps}} kbps',
        },
      },
    });
    translate.use('en');
  });

  const createComponent = (collapsed = false) => {
    const fixture = TestBed.createComponent(CallControlsAsideComponent);
    const componentRef: ComponentRef<CallControlsAsideComponent> =
      fixture.componentRef;
    componentRef.setInput('collapsed', collapsed);
    fixture.detectChanges();
    return fixture;
  };

  const hintText = (fixture: ReturnType<typeof createComponent>): string => {
    const button = fixture.debugElement.query(By.css('.panel-button-spaced'));
    const hint = button.injector.get(TuiHintDirective);
    const content = hint.content();
    expect(content).toBeInstanceOf(TemplateRef);

    const view = (content as TemplateRef<unknown>).createEmbeddedView({});
    view.detectChanges();
    const text = view.rootNodes
      .filter((node: Node) => node.nodeType === Node.ELEMENT_NODE)
      .map((node: Node) => node.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    view.destroy();
    return text;
  };

  it('keeps the control buttons and hides the session block without a session', () => {
    const fixture = createComponent();
    const buttons = fixture.nativeElement.querySelectorAll('button');

    expect(
      fixture.nativeElement.querySelector('.panel-button-spaced'),
    ).toBeNull();
    expect(buttons.length).toBe(3);
  });

  it('shows the session title on the button when expanded and in the hint when collapsed', () => {
    roomsDict.set({ 10: { id: 10, name: 'General Voice' } as IRoom });
    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 10,
    });

    const fixture = createComponent(false);
    const button = fixture.nativeElement.querySelector(
      'button.panel-button-spaced',
    ) as HTMLButtonElement;

    expect(button.textContent).toContain('General Voice');
    expect(hintText(fixture)).toBe('Voice quality: excellent. 64 kbps');

    fixture.componentRef.setInput('collapsed', true);
    fixture.detectChanges();

    expect(button.textContent).not.toContain('General Voice');
    expect(hintText(fixture)).toContain('General Voice');
    expect(hintText(fixture)).toContain('Voice quality: excellent. 64 kbps');
  });
});
