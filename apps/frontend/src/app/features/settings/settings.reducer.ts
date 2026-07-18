import { createReducer, on } from '@ngrx/store';
import { EStorageKey } from '../../app.enums';
import { SettingsActions } from './settings.actions';

export interface ISettingsState {
  audioInput: MediaDeviceInfo | null;
  audioOutput: MediaDeviceInfo | null;
}

export const initialState: ISettingsState = {
  audioInput: null,
  audioOutput: null,
};

export const settingsReducer = createReducer(
  initialState,
  on(SettingsActions.init, (state, init) => ({
    ...state,
    ...init,
  })),
  on(SettingsActions.setAudioInput, (state, { audioInput }) => ({
    ...state,
    audioInput,
  })),
  on(SettingsActions.setAudioOutput, (state, { audioOutput }) => ({
    ...state,
    audioOutput,
  })),
);
