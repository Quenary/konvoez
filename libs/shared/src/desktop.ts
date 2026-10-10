import * as z from 'zod';
import { pushNotificationPayloadSchema } from './schemas/notification.schemas';

export const DESKTOP_BRIDGE_API_VERSION = 1 as const;

export enum EDesktopCommand {
  TOGGLE_MIC = 'toggle-mic',
  TOGGLE_SPEAKER = 'toggle-speaker',
  QUIT_REQUESTED = 'quit-requested',
}

export enum EDesktopIpc {
  NOTIFY = 'konvoez:notify',
  SET_VOICE_STATE = 'konvoez:set-voice-state',
  QUIT_READY = 'konvoez:quit-ready',
  COMMAND = 'konvoez:command', // main -> renderer
  // local pages only
  LOCAL_GET_CONFIG = 'konvoez-local:get-config',
  LOCAL_TEST_SERVER = 'konvoez-local:test-server',
  LOCAL_SAVE_SERVER = 'konvoez-local:save-server',
  LOCAL_SAVE_SETTINGS = 'konvoez-local:save-settings',
  LOCAL_PICK_SOURCE = 'konvoez-local:pick-source',
  LOCAL_PICKER_SOURCES = 'konvoez-local:picker-sources',
}

export const desktopVoiceStateSchema = z.object({
  inVoice: z.boolean(),
  micMuted: z.boolean(),
  speakerMuted: z.boolean(),
});

export const desktopHotkeysSchema = z.object({
  toggleMic: z.string().max(64).nullable(),
  toggleSpeaker: z.string().max(64).nullable(),
});

export const desktopNotificationSchema = pushNotificationPayloadSchema;

export type TDesktopVoiceState = z.infer<typeof desktopVoiceStateSchema>;
export type TDesktopHotkeys = z.infer<typeof desktopHotkeysSchema>;

export interface IKonvoezDesktopBridge {
  readonly apiVersion: typeof DESKTOP_BRIDGE_API_VERSION;
  readonly platform: 'win32' | 'linux';
  readonly appVersion: string;
  notify(payload: z.infer<typeof desktopNotificationSchema>): void;
  setVoiceState(state: TDesktopVoiceState): void;
  onCommand(listener: (command: EDesktopCommand) => void): () => void;
  quitReady(): void;
}
