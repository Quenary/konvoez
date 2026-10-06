import { Injectable } from '@angular/core';
import type { Consumer } from 'mediasoup-client/types';

/**
 * Owns video consumers created by the mediasoup session.
 * Peer state keeps the track and ids so a later pause or layer change
 * can look the consumer up here.
 */
@Injectable({ providedIn: 'root' })
export class ConsumerRegistry {
  private readonly byId = new Map<string, Consumer>();

  public add(consumer: Consumer): void {
    this.byId.set(consumer.id, consumer);
  }

  public get(id: string): Consumer | undefined {
    return this.byId.get(id);
  }

  public close(id: string): void {
    const consumer = this.byId.get(id);
    if (!consumer) {
      return;
    }
    this.byId.delete(id);
    if (!consumer.closed) {
      consumer.close();
    }
  }
}
