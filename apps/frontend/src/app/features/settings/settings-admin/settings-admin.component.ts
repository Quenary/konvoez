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
  DEFAULT_ICE_SERVERS,
  ESettingKey,
  iceServersSettingValueSchema,
  SCHEMA_ERROR,
  TSettingsUpdate,
} from '@konvoez/shared';
import {
  TuiButton,
  TuiError,
  TuiLabel,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TuiSwitch, TuiTextarea } from '@taiga-ui/kit';
import { SettingsStore } from '../settings.store';

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
    TuiLabel,
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
    iceServersJson: new FormControl('', {
      nonNullable: true,
      validators: [iceServersJsonValidator],
    }),
  });

  protected readonly defaultIceServers = this.stringify(DEFAULT_ICE_SERVERS);

  constructor() {
    effect(() => {
      const inviteOnly = this.settingsStore.inviteOnlySignUp();
      const iceServers = this.settingsStore.iceServers();

      this.form.controls.inviteOnlySignUp.setValue(inviteOnly, {
        emitEvent: false,
      });
      this.form.controls.iceServersJson.setValue(this.stringify(iceServers), {
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

    if (this.form.controls.inviteOnlySignUp.dirty) {
      updates.push({
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: this.form.controls.inviteOnlySignUp.getRawValue(),
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
