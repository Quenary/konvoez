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

  it('keeps signalled layers only when the count matches', () => {
    const single = consumer('c1');
    registry.add(single, [{ height: 720, fps: 30 }]);
    expect(registry.getLayers('c1')).toEqual([{ height: 720, fps: 30 }]);
    expect(registry.layersById()['c1']).toEqual([{ height: 720, fps: 30 }]);

    const mismatch = {
      id: 'c2',
      closed: false,
      close: vi.fn(),
      rtpParameters: { encodings: [{ scalabilityMode: 'L1T1' }] },
    } as unknown as Consumer;
    registry.add(mismatch, [
      { height: 720, fps: 30 },
      { height: 1080, fps: 30 },
    ]);
    expect(registry.getLayers('c2')).toEqual([]);
    expect(registry.layersById()['c2']).toEqual([]);

    const layered = {
      id: 'c3',
      closed: false,
      close: vi.fn(),
      rtpParameters: {
        encodings: [{ scalabilityMode: 'L1T1' }, { scalabilityMode: 'L1T1' }],
      },
    } as unknown as Consumer;
    const layers = [
      { height: 720, fps: 30 },
      { height: 1080, fps: 60 },
    ];
    registry.add(layered, layers);
    expect(registry.getLayers('c3')).toEqual(layers);
    expect(registry.layersById()['c3']).toEqual(layers);

    registry.close('c3');
    expect(registry.layersById()['c3']).toBeUndefined();
  });
});
