import { Injectable, inject, signal } from '@angular/core';
import { ConsumerRegistry } from './consumer-registry';
import { MediasoupSessionService } from './mediasoup-session.service';
import {
  getLayerHeights,
  pickAutoLayer,
  pickFixedLayer,
  TViewerQualityMode,
} from './remote-video-quality';

const RECONCILE_MS = 300;

type TRegisteredView = {
  element: HTMLElement;
  height: number;
  observer: ResizeObserver;
};

/**
 * Chooses a spatial layer for each visible video consumer.
 * Visibility and pause land in the same registry of views.
 */
@Injectable({ providedIn: 'root' })
export class RemoteVideoViewService {
  private readonly consumerRegistry = inject(ConsumerRegistry);
  private readonly mediasoupSessionService = inject(MediasoupSessionService);

  private readonly _quality = signal<TViewerQualityMode>('auto');
  public readonly quality = this._quality.asReadonly();

  private readonly views = new Map<string, Set<TRegisteredView>>();
  private readonly lastSent = new Map<string, number>();
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  public setQuality(mode: TViewerQualityMode): void {
    this._quality.set(mode);
    this.scheduleReconcile();
  }

  public registerView(consumerId: string, element: HTMLElement): () => void {
    const view: TRegisteredView = {
      element,
      height: element.clientHeight,
      observer: new ResizeObserver(() => {
        view.height = element.clientHeight;
        this.scheduleReconcile();
      }),
    };
    view.observer.observe(element);
    const set = this.views.get(consumerId) ?? new Set();
    set.add(view);
    this.views.set(consumerId, set);
    this.scheduleReconcile();
    return () => {
      view.observer.disconnect();
      set.delete(view);
      if (set.size === 0) {
        this.views.delete(consumerId);
      }
      this.scheduleReconcile();
    };
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

  private reconcile(): void {
    const mode = this._quality();
    const pixelRatio = globalThis.devicePixelRatio || 1;
    for (const consumerId of this.consumerRegistry.ids()) {
      const sourceHeight = this.consumerRegistry.getSourceHeight(consumerId);
      const layerCount = this.consumerRegistry.getLayerCount(consumerId);
      if (sourceHeight == null || layerCount < 2) {
        continue;
      }
      const views = this.views.get(consumerId);
      if (!views || views.size === 0) {
        continue;
      }
      const layerHeights = getLayerHeights(sourceHeight, layerCount);
      const tileHeight = Math.max(...[...views].map((view) => view.height));
      const desired =
        mode === 'auto'
          ? pickAutoLayer({
              tilePixelHeight: tileHeight * pixelRatio,
              layerHeights,
              current: this.lastSent.get(consumerId),
            })
          : pickFixedLayer(mode, layerHeights);
      if (this.lastSent.get(consumerId) === desired) {
        continue;
      }
      this.lastSent.set(consumerId, desired);
      void this.mediasoupSessionService.setConsumerPreferredLayer(
        consumerId,
        desired,
      );
    }
  }
}
