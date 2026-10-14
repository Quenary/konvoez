import { describe, expect, it, vi } from 'vitest';
import { isSimdSupported } from './audio-capabilities';
import { DeepFilterWorkletNode } from './noise-suppressor.port';

describe('noise-suppressor.port', () => {
  describe('DeepFilterWorkletNode', () => {
    it('destroy() posts dispose message and disconnects', () => {
      const postMessage = vi.fn();
      const disconnect = vi.fn();
      const node = Object.create(DeepFilterWorkletNode.prototype);
      node.port = { postMessage };
      node.disconnect = disconnect;

      node.destroy();

      expect(postMessage).toHaveBeenCalledWith({ type: 'dispose' });
      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('destroy() disconnects even if port.postMessage throws', () => {
      const postMessage = vi.fn().mockImplementation(() => {
        throw new Error('port closed');
      });
      const disconnect = vi.fn();
      const node = Object.create(DeepFilterWorkletNode.prototype);
      node.port = { postMessage };
      node.disconnect = disconnect;

      expect(() => node.destroy()).not.toThrow();
      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('isSimdSupported', () => {
    it('returns a boolean value indicating SIMD support', () => {
      const result = isSimdSupported();
      expect(typeof result).toBe('boolean');
    });
  });
});
