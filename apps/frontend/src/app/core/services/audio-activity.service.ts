import { computed, Injectable, Signal, signal } from '@angular/core';

interface IMonitoredNode {
  analyserNode: AnalyserNode;
  lastSpokeAt: number;
}

/**
 * Polls registered analysers and exposes a speaking map for avatars/tiles.
 * Does not mutate analyser fftSize; callers configure the node before register.
 */
@Injectable({
  providedIn: 'root',
})
export class AudioActivityService {
  private readonly _speakingMap = signal<Readonly<Record<number, boolean>>>({});

  public readonly speakingMap = this._speakingMap.asReadonly();

  private readonly threshold = 12;
  private readonly holdOffMs = 250;
  private readonly nodes = new Map<number, IMonitoredNode>();
  private readonly tempBuffer = new Uint8Array(128);
  private intervalRef: ReturnType<typeof setInterval> | null = null;

  public register(userId: number, analyserNode: AnalyserNode): void {
    this.nodes.set(userId, {
      analyserNode,
      lastSpokeAt: 0,
    });
    this.ensureLoop();
  }

  public unregister(userId: number): void {
    this.nodes.delete(userId);
    this._speakingMap.update((map) => {
      if (!(userId in map)) {
        return map;
      }
      const { [userId]: _, ...rest } = map;
      return rest;
    });
    if (this.nodes.size === 0) {
      this.stopLoop();
    }
  }

  public selectIsSpeaking(userId: number): Signal<boolean> {
    return computed(() => Boolean(this.speakingMap()[userId]));
  }

  private ensureLoop(): void {
    if (this.intervalRef) {
      return;
    }
    this.intervalRef = setInterval(() => {
      this.tick();
    }, 50);
  }

  private stopLoop(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    let changed = false;
    const currentMap = { ...this._speakingMap() };

    for (const [userId, item] of this.nodes) {
      item.analyserNode.getByteFrequencyData(this.tempBuffer);
      let sum = 0;
      const count = Math.min(32, this.tempBuffer.length);
      for (let i = 2; i < count; i++) {
        sum += this.tempBuffer[i];
      }
      const energy = sum / (count - 2);

      const isAboveThreshold = energy > this.threshold;
      if (isAboveThreshold) {
        item.lastSpokeAt = now;
      }

      const isSpeakingNow =
        isAboveThreshold || now - item.lastSpokeAt < this.holdOffMs;
      if (currentMap[userId] !== isSpeakingNow) {
        currentMap[userId] = isSpeakingNow;
        changed = true;
      }
    }

    if (changed) {
      this._speakingMap.set(currentMap);
    }
  }
}
