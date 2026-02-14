import { createActionGroup, props } from '@ngrx/store';
import { ISettingsState } from './settings.reducer';

export const SettingsActions = createActionGroup({
  source: '[SETTINGS]',
  events: {
    init: props<ISettingsState>(),
    setAudioInput: props<{ audioInput: MediaDeviceInfo }>(),
    setAudioOutput: props<{ audioOutput: MediaDeviceInfo }>(),
  },
});
