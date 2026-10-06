import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Consumer } from 'mediasoup-client/types';
import { ConsumerRegistry } from './consumer-registry';

const consumer = (id: string, closed = false): Consumer =>
  ({
    id,
    closed,
    close: vi.fn(),
  }) as unknown as Consumer;

describe('ConsumerRegistry', () => {
  let registry: ConsumerRegistry;

  beforeEach(() => {
    registry = new ConsumerRegistry();
  });

  it('stores a consumer by id', () => {
    const item = consumer('c1');
    registry.add(item);
    expect(registry.get('c1')).toBe(item);
  });

  it('closes and forgets a consumer', () => {
    const item = consumer('c1');
    registry.add(item);
    registry.close('c1');
    expect(item.close).toHaveBeenCalledTimes(1);
    expect(registry.get('c1')).toBeUndefined();
  });

  it('does not close a consumer that is already closed', () => {
    const item = consumer('c1', true);
    registry.add(item);
    registry.close('c1');
    expect(item.close).not.toHaveBeenCalled();
  });

  it('ignores an unknown id', () => {
    expect(() => registry.close('missing')).not.toThrow();
  });
});
