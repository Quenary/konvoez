import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  attachmentsMaxFilesPerMessageSettingValueSchema,
  DEFAULT_ATTACHMENTS_ENABLED,
  DEFAULT_ATTACHMENTS_MAX_FILE_SIZE,
  DEFAULT_ATTACHMENTS_MAX_FILES_PER_MESSAGE,
  DEFAULT_ATTACHMENTS_STRIP_IMAGE_METADATA,
  DEFAULT_ICE_SERVERS,
  DEFAULT_PASSWORD_RECOVERY_CODE_TTL,
  DEFAULT_VAPID_EMAIL,
  DEFAULT_VOICE_MAX_BITRATE_KBPS,
  ESettingKey,
  iceServersSettingValueSchema,
  passwordRecoveryCodeTtlSettingValueSchema,
  SCHEMA_ERROR,
  TSettingsUpdate,
  vapidEmailSettingValueSchema,
  voiceBitrateMaxKbps,
  voiceBitrateMinKbps,
  voiceMaxBitrateKbpsSettingValueSchema,
} from '@konvoez/shared';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiLabel,
  TuiScrollbar,
  TuiSlider,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TuiInputSlider, TuiSwitch, TuiTextarea } from '@taiga-ui/kit';
import { SettingsStore } from '@core/stores/settings.store';
import { PushNotificationService } from '@core/services/push-notification.service';
import { createZodFieldValidator } from '@shared/functions/zod-validator.function';
import * as z from 'zod';
import { icons } from '@constants';

function iceServersJsonValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value;
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    const result = iceServersSettingValueSchema.safeParse(parsed);
    if (!result.success) {
      return {
        invalidSchema:
          result.error.issues[0]?.message ?? SCHEMA_ERROR.INVALID_SCHEMA,
      };
    }
    return null;
  } catch {
    return { invalidSchema: SCHEMA_ERROR.INVALID_SCHEMA };
  }
}

@Component({
  selector: 'app-settings-admin',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiCardLarge,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiInput,
    TuiInputSlider,
    TuiLabel,
    TuiScrollbar,
    TuiSlider,
    TuiSwitch,
    TuiTextarea,
    TuiTextfield,
    TuiTitle,
    TuiIcon,
  ],
  templateUrl: './settings-admin.component.html',
  styleUrl: './settings-admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsAdminComponent {
  protected readonly settingsStore = inject(SettingsStore);
  protected readonly pushNotificationService = inject(PushNotificationService);

  protected readonly icons = icons;
  protected readonly voiceBitrateMinKbps = voiceBitrateMinKbps;
  protected readonly voiceBitrateMaxKbps = voiceBitrateMaxKbps;
  protected readonly voiceBitrateStep = 8;
  private readonly controlKeys = {
    inviteOnlySignUp: ESettingKey.INVITE_ONLY_SIGN_UP,
    passwordRecoveryCodeTtl: ESettingKey.PASSWORD_RECOVERY_CODE_TTL,
    vapidEmail: ESettingKey.VAPID_EMAIL,
    iceServersJson: ESettingKey.ICE_SERVERS,
    attachmentsEnabled: ESettingKey.ATTACHMENTS_ENABLED,
    attachmentsMaxFileSizeMib: ESettingKey.ATTACHMENTS_MAX_FILE_SIZE,
    attachmentsMaxFilesPerMessage:
      ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE,
    attachmentsStripImageMetadata: ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA,
    voiceMaxBitrateKbps: ESettingKey.VOICE_MAX_BITRATE_KBPS,
  } as const;

  protected readonly form = new FormGroup({
    inviteOnlySignUp: new FormControl(true, { nonNullable: true }),
    passwordRecoveryCodeTtl: new FormControl(
      DEFAULT_PASSWORD_RECOVERY_CODE_TTL,
      {
        nonNullable: true,
        validators: [
          createZodFieldValidator(passwordRecoveryCodeTtlSettingValueSchema),
        ],
      },
    ),
    vapidEmail: new FormControl(DEFAULT_VAPID_EMAIL, {
      nonNullable: true,
      validators: [createZodFieldValidator(vapidEmailSettingValueSchema)],
    }),
    iceServersJson: new FormControl('', {
      nonNullable: true,
      validators: [iceServersJsonValidator],
    }),
    attachmentsEnabled: new FormControl(DEFAULT_ATTACHMENTS_ENABLED, {
      nonNullable: true,
    }),
    attachmentsMaxFileSizeMib: new FormControl(
      DEFAULT_ATTACHMENTS_MAX_FILE_SIZE / (1024 * 1024),
      {
        nonNullable: true,
        validators: [
          createZodFieldValidator(
            z
              .number({ error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE })
              .int({ error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE })
              .min(1, { error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE })
              .max(1024, {
                error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE,
              }),
          ),
        ],
      },
    ),
    attachmentsMaxFilesPerMessage: new FormControl(
      DEFAULT_ATTACHMENTS_MAX_FILES_PER_MESSAGE,
      {
        nonNullable: true,
        validators: [
          createZodFieldValidator(
            attachmentsMaxFilesPerMessageSettingValueSchema,
          ),
        ],
      },
    ),
    attachmentsStripImageMetadata: new FormControl(
      DEFAULT_ATTACHMENTS_STRIP_IMAGE_METADATA,
      { nonNullable: true },
    ),
    voiceMaxBitrateKbps: new FormControl(DEFAULT_VOICE_MAX_BITRATE_KBPS, {
      nonNullable: true,
      validators: [
        createZodFieldValidator(voiceMaxBitrateKbpsSettingValueSchema),
      ],
    }),
  });

  protected readonly defaultIceServers = this.stringify(DEFAULT_ICE_SERVERS);
  protected readonly locked = computed(() => {
    const envLocked = this.settingsStore.envLocked();
    return {
      inviteOnlySignUp: envLocked[ESettingKey.INVITE_ONLY_SIGN_UP],
      passwordRecoveryCodeTtl:
        envLocked[ESettingKey.PASSWORD_RECOVERY_CODE_TTL],
      vapidEmail: envLocked[ESettingKey.VAPID_EMAIL],
      iceServersJson: envLocked[ESettingKey.ICE_SERVERS],
      attachmentsEnabled: envLocked[ESettingKey.ATTACHMENTS_ENABLED],
      attachmentsMaxFileSizeMib:
        envLocked[ESettingKey.ATTACHMENTS_MAX_FILE_SIZE],
      attachmentsMaxFilesPerMessage:
        envLocked[ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE],
      attachmentsStripImageMetadata:
        envLocked[ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA],
      voiceMaxBitrateKbps: envLocked[ESettingKey.VOICE_MAX_BITRATE_KBPS],
    };
  });

  constructor() {
    effect(() => {
      const inviteOnly = this.settingsStore.inviteOnlySignUp();
      const recoveryTtl = this.settingsStore.passwordRecoveryCodeTtl();
      const vapidEmail = this.settingsStore.vapidEmail();
      const iceServers = this.settingsStore.iceServers();
      const attachmentsEnabled = this.settingsStore.attachmentsEnabled();
      const attachmentsMaxFileSize =
        this.settingsStore.attachmentsMaxFileSize();
      const attachmentsMaxFiles =
        this.settingsStore.attachmentsMaxFilesPerMessage();
      const stripMetadata = this.settingsStore.attachmentsStripImageMetadata();
      const voiceMaxBitrate = this.settingsStore.voiceMaxBitrateKbps();
      const envLocked = this.settingsStore.envLocked();

      this.form.controls.inviteOnlySignUp.setValue(inviteOnly, {
        emitEvent: false,
      });
      this.form.controls.passwordRecoveryCodeTtl.setValue(recoveryTtl, {
        emitEvent: false,
      });
      this.form.controls.vapidEmail.setValue(vapidEmail, { emitEvent: false });
      this.form.controls.iceServersJson.setValue(this.stringify(iceServers), {
        emitEvent: false,
      });
      this.form.controls.attachmentsEnabled.setValue(attachmentsEnabled, {
        emitEvent: false,
      });
      this.form.controls.attachmentsMaxFileSizeMib.setValue(
        attachmentsMaxFileSize / (1024 * 1024),
        { emitEvent: false },
      );
      this.form.controls.attachmentsMaxFilesPerMessage.setValue(
        attachmentsMaxFiles,
        { emitEvent: false },
      );
      this.form.controls.attachmentsStripImageMetadata.setValue(stripMetadata, {
        emitEvent: false,
      });
      this.form.controls.voiceMaxBitrateKbps.setValue(voiceMaxBitrate, {
        emitEvent: false,
      });

      for (const [name, key] of Object.entries(this.controlKeys) as Array<
        [keyof typeof this.form.controls, ESettingKey]
      >) {
        const control = this.form.controls[name];
        if (envLocked[key]) {
          control.disable({ emitEvent: false });
        } else {
          control.enable({ emitEvent: false });
        }
      }
    });
  }

  protected get iceServersError(): string | null {
    return this.form.controls.iceServersJson.errors?.['invalidSchema'] ?? null;
  }

  protected get vapidEmailError(): string | null {
    return (
      this.form.controls.vapidEmail.errors?.['zod'] ??
      this.form.controls.vapidEmail.errors?.['invalidSchema'] ??
      null
    );
  }

  protected get voiceMaxBitrateError(): string | null {
    return (
      this.form.controls.voiceMaxBitrateKbps.errors?.['zod'] ??
      this.form.controls.voiceMaxBitrateKbps.errors?.['invalidSchema'] ??
      null
    );
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const updates: TSettingsUpdate = [];

    // TODO: Refactor, bind controls to keys, use loop over form.controls
    if (this.form.controls.inviteOnlySignUp.dirty) {
      updates.push({
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: this.form.controls.inviteOnlySignUp.getRawValue(),
      });
    }

    if (this.form.controls.passwordRecoveryCodeTtl.dirty) {
      updates.push({
        key: ESettingKey.PASSWORD_RECOVERY_CODE_TTL,
        value: Number(this.form.controls.passwordRecoveryCodeTtl.getRawValue()),
      });
    }

    if (
      this.form.controls.vapidEmail.dirty &&
      this.form.controls.vapidEmail.enabled
    ) {
      updates.push({
        key: ESettingKey.VAPID_EMAIL,
        value: this.form.controls.vapidEmail.getRawValue().trim(),
      });
    }

    if (this.form.controls.attachmentsEnabled.dirty) {
      updates.push({
        key: ESettingKey.ATTACHMENTS_ENABLED,
        value: this.form.controls.attachmentsEnabled.getRawValue(),
      });
    }

    if (this.form.controls.attachmentsMaxFileSizeMib.dirty) {
      updates.push({
        key: ESettingKey.ATTACHMENTS_MAX_FILE_SIZE,
        value:
          Number(this.form.controls.attachmentsMaxFileSizeMib.getRawValue()) *
          1024 *
          1024,
      });
    }

    if (this.form.controls.attachmentsMaxFilesPerMessage.dirty) {
      updates.push({
        key: ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE,
        value: Number(
          this.form.controls.attachmentsMaxFilesPerMessage.getRawValue(),
        ),
      });
    }

    if (this.form.controls.attachmentsStripImageMetadata.dirty) {
      updates.push({
        key: ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA,
        value: this.form.controls.attachmentsStripImageMetadata.getRawValue(),
      });
    }

    if (this.form.controls.voiceMaxBitrateKbps.dirty) {
      updates.push({
        key: ESettingKey.VOICE_MAX_BITRATE_KBPS,
        value: Number(this.form.controls.voiceMaxBitrateKbps.getRawValue()),
      });
    }

    if (this.form.controls.iceServersJson.dirty) {
      const parsedIceServers = JSON.parse(
        this.form.controls.iceServersJson.getRawValue(),
      );
      updates.push({
        key: ESettingKey.ICE_SERVERS,
        value: parsedIceServers,
      });
    }

    if (updates.length === 0) {
      return;
    }

    this.settingsStore.updateSettings(updates);
    if (updates.some((item) => item.key === ESettingKey.VAPID_EMAIL)) {
      this.pushNotificationService.loadServerKey().subscribe();
    }
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private stringify(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
