import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EDesktopCommand } from '@konvoez/shared';
import {
  applyHotkeys,
  resetHotkeyStateForTests,
  resumeHotkeys,
  suspendHotkeys,
} from './hotkeys';
import type { globalShortcut } from 'electron';

describe('applyHotkeys', () => {
  beforeEach(async () => {
    resetHotkeyStateForTests();
    // A built addon on the dev machine must not switch these tests to the native hook.
    const nativeMod = await import('./native.js');
    vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue(null);
  });
  it('registers accelerators and returns ok on success', () => {
    const unregisterAll = vi.fn();
    const register = vi.fn().mockReturnValue(true);
    const mockManager = {
      unregisterAll,
      register,
    } as unknown as typeof globalShortcut;

    const onCommand = vi.fn();

    const statuses = applyHotkeys(
      {
        toggleMic: 'CommandOrControl+Shift+M',
        toggleSpeaker: 'CommandOrControl+Shift+D',
      },
      mockManager,
      onCommand,
    );

    expect(unregisterAll).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual({
      toggleMic: 'ok',
      toggleSpeaker: 'ok',
    });

    // Invoke registered listener
    const firstCallback = register.mock.calls[0][1];
    firstCallback();
    expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_MIC);
  });

  it('handles unset keys, conflict, and invalid accelerators', () => {
    const unregisterAll = vi.fn();
    const register = vi.fn().mockImplementation((accel: string) => {
      if (accel === 'Conflict+Key') return false;
      if (accel === 'Bad+Accel') throw new Error('Invalid');
      return true;
    });
    const mockManager = {
      unregisterAll,
      register,
    } as unknown as typeof globalShortcut;

    const statuses = applyHotkeys(
      {
        toggleMic: null,
        toggleSpeaker: 'Conflict+Key',
      },
      mockManager,
    );

    expect(statuses).toEqual({
      toggleMic: 'unset',
      toggleSpeaker: 'conflict',
    });

    const invalidStatuses = applyHotkeys(
      {
        toggleMic: 'Bad+Accel',
        toggleSpeaker: null,
      },
      mockManager,
    );

    expect(invalidStatuses).toEqual({
      toggleMic: 'invalid',
      toggleSpeaker: 'unset',
    });
  });

  it('rejects a sided modifier and a modifier alone for globalShortcut', () => {
    const register = vi.fn().mockReturnValue(true);
    const mockManager = {
      unregisterAll: vi.fn(),
      register,
    } as unknown as typeof globalShortcut;

    const statuses = applyHotkeys(
      {
        toggleMic: 'ControlRight',
        toggleSpeaker: 'ControlLeft+M',
      },
      mockManager,
    );

    expect(register).not.toHaveBeenCalled();
    expect(statuses).toEqual({
      toggleMic: 'invalid',
      toggleSpeaker: 'invalid',
    });
  });

  it('suspend unregisters and resume re-registers stored hotkeys', () => {
    const unregisterAll = vi.fn();
    const register = vi.fn().mockReturnValue(true);
    const mockManager = {
      unregisterAll,
      register,
    } as unknown as typeof globalShortcut;

    applyHotkeys(
      {
        toggleMic: 'CommandOrControl+Shift+M',
        toggleSpeaker: 'CommandOrControl+Shift+D',
      },
      mockManager,
    );
    expect(register).toHaveBeenCalledTimes(2);

    suspendHotkeys(mockManager);
    expect(unregisterAll.mock.calls.length).toBeGreaterThan(0);

    resumeHotkeys(mockManager);
    expect(register).toHaveBeenCalledTimes(4);
  });

  describe('native key hook integration', () => {
    it('uses native key hook when supported, dispatches hotkeys without auto-repeat', async () => {
      const nativeMod = await import('./native.js');
      const stopHook = vi.fn();
      let hookListener:
        ((event: { code: string; down: boolean }) => void) | null = null;
      const startKeyHook = vi.fn().mockImplementation((cb) => {
        hookListener = cb;
        return { stop: stopHook };
      });

      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => false,
        isKeyHookSupported: () => true,
        getAudioStreams: () => [],
        startAudioCapture: vi.fn(),
        startKeyHook,
      });

      const onCommand = vi.fn();
      const mockManager = {
        unregisterAll: vi.fn(),
        register: vi.fn(),
      } as unknown as typeof globalShortcut;

      const statuses = applyHotkeys(
        {
          toggleMic: 'CommandOrControl+Shift+M',
          toggleSpeaker: 'F12',
        },
        mockManager,
        onCommand,
      );

      expect(statuses).toEqual({
        toggleMic: 'ok',
        toggleSpeaker: 'ok',
      });
      expect(startKeyHook).toHaveBeenCalledTimes(1);
      expect(hookListener).toBeDefined();
      const listener = hookListener as (event: {
        code: string;
        down: boolean;
      }) => void;

      // Press CtrlLeft down
      listener({ code: 'ControlLeft', down: true });
      expect(onCommand).not.toHaveBeenCalled();

      // Press ShiftLeft down
      listener({ code: 'ShiftLeft', down: true });
      expect(onCommand).not.toHaveBeenCalled();

      // Press KeyM down -> matches CommandOrControl+Shift+M
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_MIC);

      // Auto-repeat event for KeyM -> should NOT trigger again
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledTimes(1);

      // X11 detectable autorepeat is release + press. The press is marked repeat.
      listener({ code: 'KeyM', down: false });
      listener({ code: 'KeyM', down: true, repeat: true });
      expect(onCommand).toHaveBeenCalledTimes(1);

      // Release KeyM and modifiers
      listener({ code: 'KeyM', down: false });
      listener({ code: 'ControlLeft', down: false });
      listener({ code: 'ShiftLeft', down: false });

      // Press F12 -> matches toggleSpeaker
      listener({ code: 'F12', down: true });
      expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_SPEAKER);

      // Suspend hotkeys -> should not trigger while suspended
      suspendHotkeys(mockManager);
      listener({ code: 'F12', down: false });
      listener({ code: 'F12', down: true });
      expect(onCommand).toHaveBeenCalledTimes(2);

      // Resume hotkeys
      resumeHotkeys(mockManager, onCommand);
      listener({ code: 'F12', down: false });
      listener({ code: 'F12', down: true });
      expect(onCommand).toHaveBeenCalledTimes(3);

      // Reset state stops the hook
      resetHotkeyStateForTests();
      expect(stopHook).toHaveBeenCalled();
    });

    it('fires again when a held key is pressed after a long gap', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const nativeMod = await import('./native.js');
      let hookListener:
        ((event: { code: string; down: boolean }) => void) | null = null;
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => false,
        isKeyHookSupported: () => true,
        getAudioStreams: () => [],
        startAudioCapture: vi.fn(),
        startKeyHook: vi.fn().mockImplementation((cb) => {
          hookListener = cb;
          return { stop: vi.fn() };
        }),
      });
      const onCommand = vi.fn();
      const mockManager = {
        unregisterAll: vi.fn(),
        register: vi.fn(),
      } as unknown as typeof globalShortcut;
      applyHotkeys(
        { toggleMic: null, toggleSpeaker: 'F12' },
        mockManager,
        onCommand,
      );
      const listener = hookListener as (event: {
        code: string;
        down: boolean;
      }) => void;
      listener({ code: 'F12', down: true });
      listener({ code: 'F12', down: true });
      expect(onCommand).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date('2026-01-01T00:00:03Z'));
      listener({ code: 'F12', down: true });
      expect(onCommand).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('falls back to globalShortcut when the native hook fails to start', async () => {
      const nativeMod = await import('./native.js');
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => false,
        isKeyHookSupported: () => true,
        getAudioStreams: () => [],
        startAudioCapture: vi.fn(),
        startKeyHook: vi.fn(() => {
          throw new Error('hook rejected');
        }),
      });

      const register = vi.fn().mockReturnValue(true);
      const mockManager = {
        unregisterAll: vi.fn(),
        register,
      } as unknown as typeof globalShortcut;

      const statuses = applyHotkeys(
        {
          toggleMic: 'CommandOrControl+Shift+M',
          toggleSpeaker: null,
        },
        mockManager,
      );

      expect(register).toHaveBeenCalledWith(
        'CommandOrControl+Shift+M',
        expect.any(Function),
      );
      expect(statuses).toEqual({
        toggleMic: 'ok',
        toggleSpeaker: 'unset',
      });
    });

    it('matches stored hotkeys using modifier synonyms like Ctrl or CmdOrCtrl', async () => {
      const nativeMod = await import('./native.js');
      let hookListener:
        ((event: { code: string; down: boolean }) => void) | null = null;
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => false,
        isKeyHookSupported: () => true,
        getAudioStreams: () => [],
        startAudioCapture: vi.fn(),
        startKeyHook: vi.fn().mockImplementation((cb) => {
          hookListener = cb;
          return { stop: vi.fn() };
        }),
      });

      const onCommand = vi.fn();
      const mockManager = {
        unregisterAll: vi.fn(),
        register: vi.fn(),
      } as unknown as typeof globalShortcut;

      applyHotkeys(
        {
          toggleMic: 'Ctrl+Shift+M',
          toggleSpeaker: 'CmdOrCtrl+D',
        },
        mockManager,
        onCommand,
      );

      const listener = hookListener as unknown as (event: {
        code: string;
        down: boolean;
      }) => void;

      // Press ControlLeft + ShiftLeft + KeyM
      listener({ code: 'ControlLeft', down: true });
      listener({ code: 'ShiftLeft', down: true });
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_MIC);

      // Release
      listener({ code: 'KeyM', down: false });
      listener({ code: 'ShiftLeft', down: false });

      // Press KeyD with Ctrl still down
      listener({ code: 'KeyD', down: true });
      expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_SPEAKER);
    });

    it('fires a right-side modifier alone and keeps the other side distinct', async () => {
      const nativeMod = await import('./native.js');
      let hookListener:
        ((event: { code: string; down: boolean }) => void) | null = null;
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => false,
        isKeyHookSupported: () => true,
        getAudioStreams: () => [],
        startAudioCapture: vi.fn(),
        startKeyHook: vi.fn().mockImplementation((cb) => {
          hookListener = cb;
          return { stop: vi.fn() };
        }),
      });

      const onCommand = vi.fn();
      const mockManager = {
        unregisterAll: vi.fn(),
        register: vi.fn(),
      } as unknown as typeof globalShortcut;

      const statuses = applyHotkeys(
        {
          toggleMic: 'ControlRight',
          toggleSpeaker: 'ControlLeft+M',
        },
        mockManager,
        onCommand,
      );
      expect(statuses).toEqual({
        toggleMic: 'ok',
        toggleSpeaker: 'ok',
      });

      const listener = hookListener as unknown as (event: {
        code: string;
        down: boolean;
      }) => void;

      listener({ code: 'ControlLeft', down: true });
      expect(onCommand).not.toHaveBeenCalled();
      listener({ code: 'ControlLeft', down: false });

      listener({ code: 'ControlRight', down: true });
      expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_MIC);
      listener({ code: 'ControlRight', down: false });

      listener({ code: 'ControlLeft', down: true });
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_SPEAKER);
      expect(onCommand).toHaveBeenCalledTimes(2);

      listener({ code: 'KeyM', down: false });
      listener({ code: 'ControlLeft', down: false });
      listener({ code: 'ControlRight', down: true });
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledTimes(3);
      expect(onCommand).toHaveBeenLastCalledWith(EDesktopCommand.TOGGLE_MIC);
    });

    it('matches a legacy unsided chord from either side and rejects an extra modifier', async () => {
      const nativeMod = await import('./native.js');
      let hookListener:
        ((event: { code: string; down: boolean }) => void) | null = null;
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => false,
        isKeyHookSupported: () => true,
        getAudioStreams: () => [],
        startAudioCapture: vi.fn(),
        startKeyHook: vi.fn().mockImplementation((cb) => {
          hookListener = cb;
          return { stop: vi.fn() };
        }),
      });

      const onCommand = vi.fn();
      applyHotkeys(
        {
          toggleMic: 'CommandOrControl+Shift+M',
          toggleSpeaker: null,
        },
        {
          unregisterAll: vi.fn(),
          register: vi.fn(),
        } as unknown as typeof globalShortcut,
        onCommand,
      );

      const listener = hookListener as unknown as (event: {
        code: string;
        down: boolean;
      }) => void;

      listener({ code: 'ControlLeft', down: true });
      listener({ code: 'ShiftRight', down: true });
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledTimes(1);

      listener({ code: 'KeyM', down: false });
      listener({ code: 'ShiftRight', down: false });
      listener({ code: 'ControlLeft', down: false });

      listener({ code: 'ControlRight', down: true });
      listener({ code: 'ShiftLeft', down: true });
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledTimes(2);

      listener({ code: 'KeyM', down: false });
      listener({ code: 'ShiftLeft', down: false });
      listener({ code: 'ControlRight', down: false });

      listener({ code: 'ControlLeft', down: true });
      listener({ code: 'AltLeft', down: true });
      listener({ code: 'KeyM', down: true });
      expect(onCommand).toHaveBeenCalledTimes(2);
    });

    it('treats Left Ctrl sent with Right Alt as Right Alt alone', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const nativeMod = await import('./native.js');
      let hookListener:
        ((event: { code: string; down: boolean }) => void) | null = null;
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => false,
        isKeyHookSupported: () => true,
        getAudioStreams: () => [],
        startAudioCapture: vi.fn(),
        startKeyHook: vi.fn().mockImplementation((cb) => {
          hookListener = cb;
          return { stop: vi.fn() };
        }),
      });

      const onCommand = vi.fn();
      applyHotkeys(
        { toggleMic: 'AltRight', toggleSpeaker: null },
        {
          unregisterAll: vi.fn(),
          register: vi.fn(),
        } as unknown as typeof globalShortcut,
        onCommand,
      );
      const listener = hookListener as unknown as (event: {
        code: string;
        down: boolean;
      }) => void;

      listener({ code: 'ControlLeft', down: true });
      listener({ code: 'AltRight', down: true });
      expect(onCommand).toHaveBeenCalledTimes(1);
      expect(onCommand).toHaveBeenCalledWith(EDesktopCommand.TOGGLE_MIC);

      listener({ code: 'AltRight', down: false });
      listener({ code: 'ControlLeft', down: false });
      vi.setSystemTime(new Date('2026-01-01T00:00:00.200Z'));
      listener({ code: 'ControlLeft', down: true });
      vi.setSystemTime(new Date('2026-01-01T00:00:00.400Z'));
      listener({ code: 'AltRight', down: true });
      expect(onCommand).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });
});
