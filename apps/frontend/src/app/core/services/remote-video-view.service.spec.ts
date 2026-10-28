import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Consumer } from 'mediasoup-client/types';
import { ConsumerRegistry } from './consumer-registry';
import { MediasoupSessionService } from './mediasoup-session.service';
import { RemoteVideoViewService } from './remote-video-view.service';

type TIntersectionStub = {
  callback: (entries: { isIntersecting: boolean }[]) => void;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

describe('RemoteVideoViewService', () => {
  let service: RemoteVideoViewService;
  let registry: ConsumerRegistry;
  let setConsumerPreferredLayer: ReturnType<typeof vi.fn>;
  let pauseConsumer: ReturnType<typeof vi.fn>;
  let resumeConsumer: ReturnType<typeof vi.fn>;
  let intersections: TIntersectionStub[];
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
    vi.stubGlobal('devicePixelRatio', 1);
    intersections = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor(
          callback: (entries: { isIntersecting: boolean }[]) => void,
        ) {
          intersections.push({
            callback,
            observe: this.observe,
            disconnect: this.disconnect,
          });
        }
      },
    );
    setConsumerPreferredLayer = vi.fn().mockResolvedValue(undefined);
    pauseConsumer = vi.fn().mockResolvedValue(true);
    resumeConsumer = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        RemoteVideoViewService,
        ConsumerRegistry,
        {
          provide: MediasoupSessionService,
          useValue: {
            setConsumerPreferredLayer,
            pauseConsumer,
            resumeConsumer,
          },
        },
      ],
    });
    service = TestBed.inject(RemoteVideoViewService);
    registry = TestBed.inject(ConsumerRegistry);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const addConsumer = (id: string) => {
    registry.add(
      {
        id,
        closed: false,
        close: vi.fn(),
        observer: { on: vi.fn() },
        rtpParameters: { encodings: [{ scalabilityMode: 'L3T1' }] },
      } as unknown as Consumer,
      1080,
    );
  };

  const show = (index: number) => {
    intersections[index]?.callback([{ isIntersecting: true }]);
  };

  const hide = (index: number) => {
    intersections[index]?.callback([{ isIntersecting: false }]);
  };

  it('sends a preferred layer for the largest registered tile', async () => {
    addConsumer('c1');
    const element = { clientHeight: 200 } as HTMLElement;
    const dispose = service.registerView('c1', element);
    show(0);
    await vi.advanceTimersByTimeAsync(300);

    expect(setConsumerPreferredLayer).toHaveBeenCalledWith('c1', 0);
    dispose();
  });

  it('resumes a paused consumer when a view is visible and applies the layer first', async () => {
    addConsumer('c1');
    const order: string[] = [];
    setConsumerPreferredLayer.mockImplementation(async () => {
      order.push('layer');
    });
    resumeConsumer.mockImplementation(async () => {
      order.push('resume');
    });
    service.registerView('c1', { clientHeight: 200 } as HTMLElement);
    show(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(order).toEqual(['layer', 'resume']);
    expect(resumeConsumer).toHaveBeenCalledWith('c1');
  });

  it('pauses a hidden view only after the delay and cancels when it returns', async () => {
    addConsumer('c1');
    service.registerView('c1', { clientHeight: 200 } as HTMLElement);
    show(0);
    hide(0);
    await vi.advanceTimersByTimeAsync(1999);
    expect(pauseConsumer).not.toHaveBeenCalled();

    show(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pauseConsumer).not.toHaveBeenCalled();

    hide(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pauseConsumer).toHaveBeenCalledWith('c1');
  });

  it('pauses every consumer while the tab is hidden and resumes when it returns', async () => {
    addConsumer('c1');
    service.registerView('c1', { clientHeight: 400 } as HTMLElement);
    show(0);
    resumeConsumer.mockClear();

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(pauseConsumer).toHaveBeenCalledWith('c1');

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(resumeConsumer).toHaveBeenCalledWith('c1');
  });

  it('stays active while either of two views is visible and uses the larger size', async () => {
    addConsumer('c1');
    service.registerView('c1', { clientHeight: 200 } as HTMLElement);
    service.registerView('c1', { clientHeight: 800 } as HTMLElement);
    show(0);
    show(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(setConsumerPreferredLayer).toHaveBeenCalledWith('c1', 2);

    hide(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pauseConsumer).not.toHaveBeenCalled();
    expect(setConsumerPreferredLayer).toHaveBeenCalledWith('c1', 0);
  });

  it('resumes only after an in-flight pause settles', async () => {
    addConsumer('c1');
    service.registerView('c1', { clientHeight: 200 } as HTMLElement);
    show(0);
    await vi.advanceTimersByTimeAsync(0);
    resumeConsumer.mockClear();

    let resolvePause: (paused: boolean) => void = () => undefined;
    pauseConsumer.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolvePause = resolve;
      }),
    );
    hide(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pauseConsumer).toHaveBeenCalledTimes(1);

    show(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(resumeConsumer).not.toHaveBeenCalled();

    resolvePause(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(resumeConsumer).toHaveBeenCalledWith('c1');
  });

  it('retries a failed pause while the view stays hidden', async () => {
    addConsumer('c1');
    pauseConsumer.mockResolvedValue(false);
    service.registerView('c1', { clientHeight: 200 } as HTMLElement);
    show(0);
    hide(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pauseConsumer).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(pauseConsumer).toHaveBeenCalledTimes(2);
  });

  it('pauses after every view is disposed and when a consumer has no views', async () => {
    addConsumer('c1');
    const dispose = service.registerView('c1', {
      clientHeight: 200,
    } as HTMLElement);
    show(0);
    dispose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(pauseConsumer).toHaveBeenCalledWith('c1');
  });
});
