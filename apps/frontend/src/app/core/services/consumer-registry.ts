import { Injectable, signal } from '@angular/core';
import type { Consumer } from 'mediasoup-client/types';
import { getConsumerLayerCount } from './remote-video-quality';

type TRegisteredConsumer = {
  consumer: Consumer;
  sourceHeight?: number;
};

/**
 * Owns video consumers created by the mediasoup session.
 * Peer state keeps the track and ids so a later pause or layer change
 * can look the consumer up here.
 */
@Injectable({ providedIn: 'root' })
export class ConsumerRegistry {
  private readonly byId = new Map<string, TRegisteredConsumer>();
  private readonly _layered = signal(false);
  public readonly layered = this._layered.asReadonly();

  public add(consumer: Consumer, sourceHeight?: number): void {
    this.byId.set(consumer.id, { consumer, sourceHeight });
    this.refreshLayered();
  }

  public get(id: string): Consumer | undefined {
    return this.byId.get(id)?.consumer;
  }

  public getSourceHeight(id: string): number | undefined {
    return this.byId.get(id)?.sourceHeight;
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
    this.refreshLayered();
    if (!entry.consumer.closed) {
      entry.consumer.close();
    }
  }

  private refreshLayered(): void {
    this._layered.set(
      [...this.byId.values()].some(
        (entry) => getConsumerLayerCount(entry.consumer) >= 2,
      ),
    );
  }
}
