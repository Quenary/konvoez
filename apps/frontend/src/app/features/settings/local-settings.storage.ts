import {
  LOCAL_SETTINGS_VERSION,
  localSettingsLooseSchema,
  mediaDeviceInfoSchema,
  TLocalSettingsPartial,
  TMediaDeviceInfo,
} from '@shared/schemas/local-settings.schema';
import {
  storageGetItemJson,
  storageSetItemJson,
} from '../../../extentions/local-storage-json';
import { EStorageKey } from '../../app.enums';

const parseDevice = (value: unknown): TMediaDeviceInfo | null => {
  const result = mediaDeviceInfoSchema.safeParse(value);
  return result.success ? result.data : null;
};

/**
 * Read known fields from LOCAL_SETTINGS (loose). Invalid fields are ignored.
 */
export const readLocalSettings = (): TLocalSettingsPartial => {
  const raw = storageGetItemJson(EStorageKey.LOCAL_SETTINGS);
  if (raw == null) {
    return {};
  }

  const parsed = localSettingsLooseSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }

  return {
    version: parsed.data.version,
    audioInput: parseDevice(parsed.data.audioInput) ?? undefined,
    audioOutput: parseDevice(parsed.data.audioOutput) ?? undefined,
  };
};

/**
 * True when local settings key is missing or stored schema version differs
 * from the app's current version.
 */
export const needsInitialSetup = (): boolean => {
  const raw = localStorage.getItem(EStorageKey.LOCAL_SETTINGS);
  if (raw == null) {
    return true;
  }

  try {
    const parsed = localSettingsLooseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return true;
    }
    return parsed.data.version !== LOCAL_SETTINGS_VERSION;
  } catch {
    return true;
  }
};

export const writeLocalSettings = (
  settings: {
    audioInput: MediaDeviceInfo | TMediaDeviceInfo | null;
    audioOutput: MediaDeviceInfo | TMediaDeviceInfo | null;
  },
  options: { stampVersion?: boolean } = {},
): void => {
  const existing = readLocalSettings();
  const version = options.stampVersion
    ? LOCAL_SETTINGS_VERSION
    : existing.version;

  const payload = {
    ...(typeof version === 'number' ? { version } : {}),
    ...(settings.audioInput
      ? { audioInput: parseDevice(settings.audioInput) ?? undefined }
      : {}),
    ...(settings.audioOutput
      ? { audioOutput: parseDevice(settings.audioOutput) ?? undefined }
      : {}),
  };

  storageSetItemJson(EStorageKey.LOCAL_SETTINGS, payload);
};
