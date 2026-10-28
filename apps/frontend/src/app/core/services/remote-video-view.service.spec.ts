import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Consumer } from 'mediasoup-client/types';
import { ConsumerRegistry } from './consumer-registry';
import { MediasoupSessionService } from './mediasoup-session.service';
import { RemoteVideoViewService } from './remote-video-view.service';

describe('RemoteVideoViewService', () => {
  let service: RemoteVideoViewService;
  let registry: ConsumerRegistry;
  let setConsumerPreferredLayer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setConsumerPreferredLayer = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        RemoteVideoViewService,
        ConsumerRegistry,
        {
          provide: MediasoupSessionService,
          useValue: { setConsumerPreferredLayer },
        },
      ],
    });
    service = TestBed.inject(RemoteVideoViewService);
    registry = TestBed.inject(ConsumerRegistry);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a preferred layer for the largest registered tile', () => {
    registry.add(
      {
        id: 'c1',
        closed: false,
        close: vi.fn(),
        rtpParameters: { encodings: [{ scalabilityMode: 'L3T1' }] },
      } as unknown as Consumer,
      1080,
    );
    const element = { clientHeight: 200 } as HTMLElement;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );

    const dispose = service.registerView('c1', element);
    vi.advanceTimersByTime(300);

    expect(setConsumerPreferredLayer).toHaveBeenCalledWith('c1', 0);
    dispose();
    vi.unstubAllGlobals();
  });
});
