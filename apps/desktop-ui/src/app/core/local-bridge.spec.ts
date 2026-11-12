import { describe, expect, it } from 'vitest';
import { readLocalBridge } from './local-bridge';

describe('readLocalBridge', () => {
  it('throws when the preload bridge is missing', () => {
    expect(() => readLocalBridge()).toThrow(
      'window.konvoezLocal bridge is not available',
    );
  });
});
