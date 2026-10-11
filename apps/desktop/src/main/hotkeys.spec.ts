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
});
