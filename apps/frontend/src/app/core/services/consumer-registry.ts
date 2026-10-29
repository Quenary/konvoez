import { Injectable, signal } from '@angular/core';
import type { TStreamLayer } from '@konvoez/shared';
import type { Consumer } from 'mediasoup-client/types';
import { getConsumerLayerCount } from './remote-video-quality';

type TRegisteredConsumer = {
  consumer: Consumer;
  layers?: TStreamLayer[];
};

/**
 * Owns video consumers created by the mediasoup session.
 * Peer state keeps the track and ids so a later pause or layer change
 * can look the consumer up here.
 */
@Injectable({ providedIn: 'root' })
export class ConsumerRegistry {
  private readonly byId = new Map<string, TRegisteredConsumer>();
  private readonly _layersById = signal<Record<string, TStreamLayer[]>>({});
  public readonly layersById = this._layersById.asReadonly();

  public add(consumer: Consumer, layers?: TStreamLayer[]): void {
    this.byId.set(consumer.id, { consumer, layers });
    this.refreshLayers();
  }

  public get(id: string): Consumer | undefined {
    return this.byId.get(id)?.consumer;
  }

  public getLayers(id: string): TStreamLayer[] {
    const entry = this.byId.get(id);
    if (!entry?.layers) {
      return [];
    }
    if (entry.layers.length !== getConsumerLayerCount(entry.consumer)) {
      return [];
    }
    return entry.layers;
  }

  public getLayerCount(id: string): number {
    const entry = this.byId.get(id);
    if (!entry) {
      return 1;
    }
    return getConsumerLayerCount(entry.consumer);
  }

  public ids(): string[] {
    return [...this.byId.keys()];
  }

  public close(id: string): void {
    const entry = this.byId.get(id);
    if (!entry) {
      return;
    }
    this.byId.delete(id);
    this.refreshLayers();
    if (!entry.consumer.closed) {
      entry.consumer.close();
    }
  }

  private refreshLayers(): void {
    const next: Record<string, TStreamLayer[]> = {};
    for (const id of this.byId.keys()) {
      next[id] = this.getLayers(id);
    }
    this._layersById.set(next);
  }
}
