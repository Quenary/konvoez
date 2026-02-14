import { createSelector } from '@ngrx/store';
import { IAppState } from '../../app.state';

const _selectSettings = (state: IAppState) => state.settings;

export const selectSettings = createSelector(_selectSettings, (state) => state);

export const selectAudioInput = createSelector(_selectSettings, (state) => state.audioInput);

export const selectAudioOutput = createSelector(_selectSettings, (state) => state.audioOutput);
