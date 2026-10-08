import { describe, expect, it, vi } from 'vitest';
import { ensureWorkletModule } from './ensure-worklet-module';

describe('ensureWorkletModule', () => {
  it('loads a worklet module once per context and URL', async () => {
    const addModule = vi.fn().mockResolvedValue(undefined);
    const context = {
      audioWorklet: { addModule },
    } as unknown as BaseAudioContext;

    const p1 = ensureWorkletModule(context, 'module-a.js');
    const p2 = ensureWorkletModule(context, 'module-a.js');

    expect(p1).toBe(p2);
    await Promise.all([p1, p2]);
    expect(addModule).toHaveBeenCalledTimes(1);
    expect(addModule).toHaveBeenCalledWith('module-a.js');

    // Loading a different URL on the same context triggers another load
    await ensureWorkletModule(context, 'module-b.js');
    expect(addModule).toHaveBeenCalledTimes(2);
    expect(addModule).toHaveBeenCalledWith('module-b.js');
  });

  it('retries loading after a failure', async () => {
    const addModule = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(undefined);
    const context = {
      audioWorklet: { addModule },
    } as unknown as BaseAudioContext;

    await expect(
      ensureWorkletModule(context, 'module-fail.js'),
    ).rejects.toThrow('network error');

    // Subsequent call for the same URL retries because the failed entry was evicted
    await expect(
      ensureWorkletModule(context, 'module-fail.js'),
    ).resolves.toBeUndefined();
    expect(addModule).toHaveBeenCalledTimes(2);
  });
});
