import { Injectable, Injector, OnDestroy, inject, signal } from '@angular/core';
import { ConsumerRegistry } from './consumer-registry';
import { MediasoupSessionService } from './mediasoup-session.service';
import {
  getLayerHeights,
  pickAutoLayer,
  pickFixedLayer,
  TViewerQualityMode,
} from './remote-video-quality';

const RECONCILE_MS = 300;
const PAUSE_DELAY_MS = 2000;

type TRegisteredView = {
  element: HTMLElement;
  height: number;
  intersecting: boolean;
  resizeObserver: ResizeObserver;
  intersectionObserver: IntersectionObserver;
};

/**
 * Chooses a spatial layer for each visible video consumer and pauses
 * a consumer while none of its tiles is on screen or the tab is hidden.
 */
@Injectable({ providedIn: 'root' })
export class RemoteVideoViewService implements OnDestroy {
  private readonly consumerRegistry = inject(ConsumerRegistry);
  private readonly injector = inject(Injector);

  private readonly _quality = signal<TViewerQualityMode>('auto');
  public readonly quality = this._quality.asReadonly();

  private readonly views = new Map<string, Set<TRegisteredView>>();
  private readonly lastSent = new Map<string, number>();
  private readonly pauseTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly playbackRetryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly syncChains = new Map<string, Promise<void>>();
  private readonly watched = new Set<string>();
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private tabVisible = true;
  private destroyed = false;
  private readonly onVisibilityChangeEvent = (): void => {
    this.tabVisible = document.visibilityState !== 'hidden';
    this.onVisibilityChange();
  };

  constructor() {
    if (typeof document === 'undefined') {
      return;
    }
    this.tabVisible = document.visibilityState !== 'hidden';
    document.addEventListener('visibilitychange', this.onVisibilityChangeEvent);
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.onVisibilityChangeEvent,
      );
    }
    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    for (const timer of this.pauseTimers.values()) {
      clearTimeout(timer);
    }
    this.pauseTimers.clear();
    for (const timer of this.playbackRetryTimers.values()) {
      clearTimeout(timer);
    }
    this.playbackRetryTimers.clear();
  }

  public setQuality(mode: TViewerQualityMode): void {
    this._quality.set(mode);
    this.scheduleReconcile();
  }

  public registerView(consumerId: string, element: HTMLElement): () => void {
    this.watchConsumer(consumerId);
    const view: TRegisteredView = {
      element,
      height: element.clientHeight,
      intersecting: false,
      resizeObserver: new ResizeObserver(() => {
        view.height = element.clientHeight;
        this.scheduleReconcile();
      }),
      intersectionObserver: new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) {
          return;
        }
        view.intersecting = entry.isIntersecting;
        this.onVisibilityChange(consumerId);
      }),
    };
    view.resizeObserver.observe(element);
    view.intersectionObserver.observe(element);
    const set = this.views.get(consumerId) ?? new Set();
    set.add(view);
    this.views.set(consumerId, set);
    this.onVisibilityChange(consumerId);
    this.scheduleReconcile();
    return () => {
      view.resizeObserver.disconnect();
      view.intersectionObserver.disconnect();
      set.delete(view);
      if (set.size === 0) {
        this.views.delete(consumerId);
      }
      this.onVisibilityChange(consumerId);
      this.scheduleReconcile();
    };
  }

  private watchConsumer(consumerId: string): void {
    if (this.watched.has(consumerId)) {
      return;
    }
    const consumer = this.consumerRegistry.get(consumerId);
    if (!consumer) {
      return;
    }
    this.watched.add(consumerId);
    consumer.observer?.on('close', () => {
      this.dropConsumer(consumerId);
    });
  }

  private dropConsumer(consumerId: string): void {
    this.clearPauseTimer(consumerId);
    this.clearPlaybackRetry(consumerId);
    const set = this.views.get(consumerId);
    if (set) {
      for (const view of set) {
        view.resizeObserver.disconnect();
        view.intersectionObserver.disconnect();
      }
    }
    this.views.delete(consumerId);
    this.lastSent.delete(consumerId);
    this.watched.delete(consumerId);
  }

  private scheduleReconcile(): void {
    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
    }
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      this.reconcile();
    }, RECONCILE_MS);
  }

  private onVisibilityChange(consumerId?: string): void {
    const ids = consumerId
      ? [consumerId]
      : new Set([
          ...this.views.keys(),
          ...this.pauseTimers.keys(),
          ...this.playbackRetryTimers.keys(),
        ]);
    for (const id of ids) {
      this.clearPlaybackRetry(id);
      if (this.isWanted(id)) {
        this.clearPauseTimer(id);
        this.enqueue(id, () => this.resumeIfWanted(id));
        continue;
      }
      if (this.pauseTimers.has(id)) {
        continue;
      }
      this.pauseTimers.set(
        id,
        setTimeout(() => {
          this.pauseTimers.delete(id);
          this.enqueue(id, () => this.pauseIfHidden(id));
        }, PAUSE_DELAY_MS),
      );
    }
  }

  private isWanted(consumerId: string): boolean {
    if (!this.tabVisible) {
      return false;
    }
    const views = this.views.get(consumerId);
    if (!views) {
      return false;
    }
    for (const view of views) {
      if (view.intersecting) {
        return true;
      }
    }
    return false;
  }

  private enqueue(consumerId: string, run: () => Promise<void>): void {
    const previous = this.syncChains.get(consumerId) ?? Promise.resolve();
    const tracked = previous.then(run, run).then(
      () => undefined,
      () => undefined,
    );
    this.syncChains.set(consumerId, tracked);
    void tracked.then(() => {
      if (this.syncChains.get(consumerId) === tracked) {
        this.syncChains.delete(consumerId);
      }
    });
  }

  private async resumeIfWanted(consumerId: string): Promise<void> {
    if (!this.isWanted(consumerId) || this.destroyed) {
      return;
    }
    await this.sendLayer(consumerId);
    if (!this.isWanted(consumerId) || this.destroyed) {
      return;
    }
    const session = this.session();
    if (!session) {
      return;
    }
    const resumed = await session.resumeConsumer(consumerId);
    if (!this.isWanted(consumerId) || this.destroyed) {
      return;
    }
    if (!resumed) {
      this.schedulePlaybackRetry(consumerId);
    }
  }

  private async pauseIfHidden(consumerId: string): Promise<void> {
    if (this.isWanted(consumerId) || this.destroyed) {
      return;
    }
    const session = this.session();
    if (!session) {
      return;
    }
    const paused = await session.pauseConsumer(consumerId);
    if (this.isWanted(consumerId) || this.destroyed) {
      return;
    }
    if (!paused) {
      this.schedulePlaybackRetry(consumerId);
    }
  }

  private schedulePlaybackRetry(consumerId: string): void {
    if (this.playbackRetryTimers.has(consumerId) || this.destroyed) {
      return;
    }
    this.playbackRetryTimers.set(
      consumerId,
      setTimeout(() => {
        this.playbackRetryTimers.delete(consumerId);
        if (this.destroyed) {
          return;
        }
        if (this.isWanted(consumerId)) {
          this.enqueue(consumerId, () => this.resumeIfWanted(consumerId));
          return;
        }
        if (this.pauseTimers.has(consumerId)) {
          return;
        }
        this.enqueue(consumerId, () => this.pauseIfHidden(consumerId));
      }, RECONCILE_MS),
    );
  }

  private reconcile(): void {
    if (!this.tabVisible) {
      return;
    }
    for (const consumerId of this.consumerRegistry.ids()) {
      if (!this.isWanted(consumerId)) {
        continue;
      }
      void this.sendLayer(consumerId);
    }
  }

  private async sendLayer(consumerId: string): Promise<void> {
    const sourceHeight = this.consumerRegistry.getSourceHeight(consumerId);
    const layerCount = this.consumerRegistry.getLayerCount(consumerId);
    if (sourceHeight == null || layerCount < 2) {
      return;
    }
    const views = this.views.get(consumerId);
    if (!views || views.size === 0) {
      return;
    }
    const layerHeights = getLayerHeights(sourceHeight, layerCount);
    const tileHeight = Math.max(
      ...[...views].map((view) => (view.intersecting ? view.height : 0)),
    );
    const mode = this._quality();
    const desired =
      mode === 'auto'
        ? pickAutoLayer({
            tilePixelHeight: tileHeight * (globalThis.devicePixelRatio || 1),
            layerHeights,
            current: this.lastSent.get(consumerId),
          })
        : pickFixedLayer(mode, layerHeights);
    if (this.lastSent.get(consumerId) === desired) {
      return;
    }
    this.lastSent.set(consumerId, desired);
    const session = this.session();
    if (!session) {
      return;
    }
    await session.setConsumerPreferredLayer(consumerId, desired);
  }

  private session(): MediasoupSessionService | null {
    if (this.destroyed) {
      return null;
    }
    return this.injector.get(MediasoupSessionService);
  }

  private clearPlaybackRetry(consumerId: string): void {
    const timer = this.playbackRetryTimers.get(consumerId);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    this.playbackRetryTimers.delete(consumerId);
  }

  private clearPauseTimer(consumerId: string): void {
    const timer = this.pauseTimers.get(consumerId);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    this.pauseTimers.delete(consumerId);
  }
}
