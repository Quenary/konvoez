import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { EVoiceConnectionState } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceConnectionNotificationComponent } from './voice-connection-notification.component';

describe('VoiceConnectionNotificationComponent', () => {
  let fixture: ComponentFixture<VoiceConnectionNotificationComponent>;
  let lossReported: ReturnType<typeof signal<boolean>>;
  let state: ReturnType<typeof signal<EVoiceConnectionState | null>>;
  let rejoin: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    lossReported = signal(false);
    state = signal<EVoiceConnectionState | null>(null);
    rejoin = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [VoiceConnectionNotificationComponent],
      providers: [
        provideTranslateService(),
        {
          provide: VoiceConnectionStore,
          useValue: {
            lossReported: lossReported.asReadonly(),
            state: state.asReadonly(),
          },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            rejoin,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VoiceConnectionNotificationComponent);
    fixture.detectChanges();
  });

  const component = () => fixture.componentInstance;

  it('keeps notification closed until lossReported is true', () => {
    expect(component()['show']()).toBe(false);

    lossReported.set(true);
    expect(component()['show']()).toBe(true);

    lossReported.set(false);
    expect(component()['show']()).toBe(false);
  });

  it('computes labelKey and appearance for each state', () => {
    state.set(EVoiceConnectionState.RECONNECTING);
    expect(component()['labelKey']()).toBe('CALL.CONNECTION.RECONNECTING');
    expect(component()['appearance']()).toBe('warning');

    state.set(EVoiceConnectionState.DISCONNECTED);
    expect(component()['labelKey']()).toBe('CALL.CONNECTION.DISCONNECTED');
    expect(component()['appearance']()).toBe('negative');

    state.set(EVoiceConnectionState.DEAD);
    expect(component()['labelKey']()).toBe('CALL.CONNECTION.DEAD');
    expect(component()['appearance']()).toBe('negative');

    state.set(EVoiceConnectionState.CONNECTED);
    expect(component()['labelKey']()).toBe('');

    state.set(null);
    expect(component()['labelKey']()).toBe('');
  });

  it('identifies DEAD state and calls rejoin() when triggered', () => {
    state.set(EVoiceConnectionState.RECONNECTING);
    expect(component()['isDead']()).toBe(false);

    state.set(EVoiceConnectionState.DEAD);
    expect(component()['isDead']()).toBe(true);

    component()['rejoin']();
    expect(rejoin).toHaveBeenCalled();
  });
});
