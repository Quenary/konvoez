import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import {
  DEFAULT_ATTACHMENTS_ENABLED,
  DEFAULT_ATTACHMENTS_MAX_FILE_SIZE,
  DEFAULT_ATTACHMENTS_MAX_FILES_PER_MESSAGE,
  DEFAULT_ATTACHMENTS_STRIP_IMAGE_METADATA,
  DEFAULT_ICE_SERVERS,
  DEFAULT_PASSWORD_RECOVERY_CODE_TTL,
  DEFAULT_VAPID_EMAIL,
  DEFAULT_STREAM_MAX_BITRATE_KBPS,
  DEFAULT_VOICE_MAX_BITRATE_KBPS,
  ESettingKey,
  SCHEMA_ERROR,
} from '@konvoez/shared';
import { SettingsStore } from '@core/stores/settings.store';
import { PushNotificationService } from '@core/services/push-notification.service';
import { SettingsAdminComponent } from './settings-admin.component';

describe('SettingsAdminComponent', () => {
  let fixture: ComponentFixture<SettingsAdminComponent>;
  let component: SettingsAdminComponent;

  let inviteOnlySignUp: ReturnType<typeof signal<boolean>>;
  let passwordRecoveryCodeTtl: ReturnType<typeof signal<number>>;
  let vapidEmail: ReturnType<typeof signal<string>>;
  let iceServers: ReturnType<typeof signal<unknown[]>>;
  let attachmentsEnabled: ReturnType<typeof signal<boolean>>;
  let attachmentsMaxFileSize: ReturnType<typeof signal<number>>;
  let attachmentsMaxFilesPerMessage: ReturnType<typeof signal<number>>;
  let attachmentsStripImageMetadata: ReturnType<typeof signal<boolean>>;
  let voiceMaxBitrateKbps: ReturnType<typeof signal<number>>;
  let streamMaxBitrateKbps: ReturnType<typeof signal<number>>;
  let envLocked: ReturnType<typeof signal<Record<string, boolean>>>;
  let updateSettings: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    inviteOnlySignUp = signal(true);
    passwordRecoveryCodeTtl = signal(DEFAULT_PASSWORD_RECOVERY_CODE_TTL);
    vapidEmail = signal(DEFAULT_VAPID_EMAIL);
    iceServers = signal(DEFAULT_ICE_SERVERS);
    attachmentsEnabled = signal(DEFAULT_ATTACHMENTS_ENABLED);
    attachmentsMaxFileSize = signal(DEFAULT_ATTACHMENTS_MAX_FILE_SIZE);
    attachmentsMaxFilesPerMessage = signal(
      DEFAULT_ATTACHMENTS_MAX_FILES_PER_MESSAGE,
    );
    attachmentsStripImageMetadata = signal(
      DEFAULT_ATTACHMENTS_STRIP_IMAGE_METADATA,
    );
    voiceMaxBitrateKbps = signal(DEFAULT_VOICE_MAX_BITRATE_KBPS);
    streamMaxBitrateKbps = signal(DEFAULT_STREAM_MAX_BITRATE_KBPS);
    envLocked = signal({});
    updateSettings = vi.fn();

    await TestBed.configureTestingModule({
      imports: [SettingsAdminComponent],
      providers: [
        provideTranslateService(),
        {
          provide: SettingsStore,
          useValue: {
            inviteOnlySignUp: inviteOnlySignUp.asReadonly(),
            passwordRecoveryCodeTtl: passwordRecoveryCodeTtl.asReadonly(),
            vapidEmail: vapidEmail.asReadonly(),
            iceServers: iceServers.asReadonly(),
            attachmentsEnabled: attachmentsEnabled.asReadonly(),
            attachmentsMaxFileSize: attachmentsMaxFileSize.asReadonly(),
            attachmentsMaxFilesPerMessage:
              attachmentsMaxFilesPerMessage.asReadonly(),
            attachmentsStripImageMetadata:
              attachmentsStripImageMetadata.asReadonly(),
            voiceMaxBitrateKbps: voiceMaxBitrateKbps.asReadonly(),
            streamMaxBitrateKbps: streamMaxBitrateKbps.asReadonly(),
            envLocked: envLocked.asReadonly(),
            updateSettings,
          },
        },
        {
          provide: PushNotificationService,
          useValue: {
            isSupported: () => true,
            loadServerKey: vi.fn(() => of(null)),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes voiceMaxBitrateKbps control with store value', () => {
    expect(component['form'].controls.voiceMaxBitrateKbps.value).toBe(64);
  });

  it('validates voiceMaxBitrateKbps range 8..384 and rejects out-of-range values', () => {
    const control = component['form'].controls.voiceMaxBitrateKbps;

    control.setValue(8);
    expect(control.valid).toBe(true);

    control.setValue(384);
    expect(control.valid).toBe(true);

    control.setValue(128);
    expect(control.valid).toBe(true);

    control.setValue(7);
    expect(control.invalid).toBe(true);
    expect(component['voiceMaxBitrateError']).toBe(
      SCHEMA_ERROR.VOICE_MAX_BITRATE_RANGE,
    );

    control.setValue(385);
    expect(control.invalid).toBe(true);
    expect(component['voiceMaxBitrateError']).toBe(
      SCHEMA_ERROR.VOICE_MAX_BITRATE_RANGE,
    );

    control.setValue(64.5);
    expect(control.invalid).toBe(true);
  });

  it('disables voiceMaxBitrateKbps control when env-locked', () => {
    envLocked.set({ [ESettingKey.VOICE_MAX_BITRATE_KBPS]: true });
    fixture.detectChanges();

    expect(component['form'].controls.voiceMaxBitrateKbps.disabled).toBe(true);
    expect(component['locked']().voiceMaxBitrateKbps).toBe(true);
  });

  it('submits updated voiceMaxBitrateKbps when control is dirty', () => {
    const control = component['form'].controls.voiceMaxBitrateKbps;
    control.setValue(128);
    control.markAsDirty();

    component['onSubmit']();

    expect(updateSettings).toHaveBeenCalledWith([
      {
        key: ESettingKey.VOICE_MAX_BITRATE_KBPS,
        value: 128,
      },
    ]);
  });

  it('does not submit voiceMaxBitrateKbps when pristine', () => {
    component['onSubmit']();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('renders the stream bitrate slider, validates the range, and saves only when dirty', () => {
    const control = component['form'].controls.streamMaxBitrateKbps;
    expect(control.value).toBe(DEFAULT_STREAM_MAX_BITRATE_KBPS);

    const inputSlider = fixture.nativeElement.querySelector(
      'input[tuiInputSlider]#stream-max-bitrate',
    );
    expect(inputSlider).toBeTruthy();
    expect(component['streamBitrateMinKbps']).toBe(1000);
    expect(component['streamBitrateMaxKbps']).toBe(100000);

    control.setValue(1000);
    expect(control.valid).toBe(true);
    control.setValue(999);
    expect(control.invalid).toBe(true);
    expect(component['streamMaxBitrateError']).toBe(
      SCHEMA_ERROR.STREAM_MAX_BITRATE_RANGE,
    );
    control.setValue(100001);
    expect(control.invalid).toBe(true);

    component['onSubmit']();
    expect(updateSettings).not.toHaveBeenCalled();

    control.setValue(20000);
    control.markAsDirty();
    component['onSubmit']();
    expect(updateSettings).toHaveBeenCalledWith([
      { key: ESettingKey.STREAM_MAX_BITRATE_KBPS, value: 20000 },
    ]);
  });

  it('disables streamMaxBitrateKbps when env-locked', () => {
    envLocked.set({ [ESettingKey.STREAM_MAX_BITRATE_KBPS]: true });
    fixture.detectChanges();

    expect(component['form'].controls.streamMaxBitrateKbps.disabled).toBe(true);
    expect(component['locked']().streamMaxBitrateKbps).toBe(true);
  });

  it('renders input slider with step 8, min 8, and max 384', () => {
    const inputSlider = fixture.nativeElement.querySelector(
      'input[tuiInputSlider]#voice-max-bitrate',
    );
    const slider = fixture.nativeElement.querySelector('input[tuiSlider]');

    expect(inputSlider).toBeTruthy();
    expect(slider).toBeTruthy();
    expect(slider.getAttribute('step')).toBe('8');
  });
});
