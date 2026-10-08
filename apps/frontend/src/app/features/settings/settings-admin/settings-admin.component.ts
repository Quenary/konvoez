import {
  ChangeDetectionStrategy,
  Component,
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
  ESettingKey,
  iceServersSettingValueSchema,
  passwordRecoveryCodeTtlSettingValueSchema,
  SCHEMA_ERROR,
  TSettingsUpdate,
} from '@konvoez/shared';
import {
  TuiButton,
  TuiError,
  TuiInput,
  TuiLabel,
  TuiScrollbar,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TuiSwitch, TuiTextarea } from '@taiga-ui/kit';
import { SettingsStore } from '@core/stores/settings.store';
import { createZodFieldValidator } from '@shared/functions/zod-validator.function';
import * as z from 'zod';

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
    TuiLabel,
    TuiScrollbar,
    TuiSwitch,
    TuiTextarea,
    TuiTextfield,
    TuiTitle,
  ],
  templateUrl: './settings-admin.component.html',
  styleUrl: './settings-admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsAdminComponent {
  protected readonly settingsStore = inject(SettingsStore);

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
  });

  protected readonly defaultIceServers = this.stringify(DEFAULT_ICE_SERVERS);

  constructor() {
    effect(() => {
      const inviteOnly = this.settingsStore.inviteOnlySignUp();
      const recoveryTtl = this.settingsStore.passwordRecoveryCodeTtl();
      const iceServers = this.settingsStore.iceServers();
      const attachmentsEnabled = this.settingsStore.attachmentsEnabled();
      const attachmentsMaxFileSize =
        this.settingsStore.attachmentsMaxFileSize();
      const attachmentsMaxFiles =
        this.settingsStore.attachmentsMaxFilesPerMessage();
      const stripMetadata = this.settingsStore.attachmentsStripImageMetadata();

      this.form.controls.inviteOnlySignUp.setValue(inviteOnly, {
        emitEvent: false,
      });
      this.form.controls.passwordRecoveryCodeTtl.setValue(recoveryTtl, {
        emitEvent: false,
      });
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
    });
  }

  protected get iceServersError(): string | null {
    return this.form.controls.iceServersJson.errors?.['invalidSchema'] ?? null;
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
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private stringify(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
