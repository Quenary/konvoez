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
  beforeEach(() => {
    resetHotkeyStateForTests();
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
      const nativeMod = await import('./native');
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
  });
});
