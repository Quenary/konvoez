import { inject, Injectable } from '@angular/core';
import { Consumer } from 'mediasoup-client/types';
import { SpeakerService } from './speaker.service';

interface IScreenAudioGraph {
  consumer: Consumer;
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
  limiterNode: AudioWorkletNode | null;
  audioEl: HTMLAudioElement | null;
}

/**
 * Separate Web Audio playback for screen-audio (not mixed into mic peer graph).
 */
@Injectable({ providedIn: 'root' })
export class PeerScreenAudioService {
  private readonly speakerService = inject(SpeakerService);
  private readonly graphs = new Map<number, IScreenAudioGraph>();

  public async attach(
    userId: number,
    consumer: Consumer,
    options: { gain: number; speakerMuted: boolean },
  ): Promise<void> {
    this.detach(userId);

    const stream = new MediaStream([consumer.track]);
    const audioEl = new Audio();
    audioEl.srcObject = stream;
    audioEl.autoplay = false;
    audioEl.muted = true;

    const context = await this.speakerService.getContext();
    const limiterNode = await this.speakerService.createPlaybackLimiter();
    const sourceNode = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.value = options.speakerMuted ? 0 : options.gain;

    sourceNode.connect(gainNode);
    if (limiterNode) {
      gainNode.connect(limiterNode);
      limiterNode.connect(context.destination);
    } else {
      gainNode.connect(context.destination);
    }

    this.graphs.set(userId, {
      consumer,
      sourceNode,
      gainNode,
      limiterNode,
      audioEl,
    });
  }

  public remove(userId: number, producerId: string): void {
    const graph = this.graphs.get(userId);
    if (!graph || graph.consumer.producerId !== producerId) {
      return;
    }
    this.detach(userId);
  }

  public getConsumerId(userId: number): string | null {
    return this.graphs.get(userId)?.consumer.id ?? null;
  }

  public detachByConsumerId(consumerId: string): void {
    for (const [userId, graph] of this.graphs) {
      if (graph.consumer.id === consumerId) {
        this.detach(userId);
        return;
      }
    }
  }

  public detach(userId: number): void {
    const graph = this.graphs.get(userId);
    if (!graph) {
      return;
    }
    this.graphs.delete(userId);
    try {
      graph.sourceNode?.disconnect();
      graph.gainNode?.disconnect();
      graph.limiterNode?.disconnect();
    } catch {
      // ignore
    }
    if (graph.audioEl) {
      graph.audioEl.srcObject = null;
      graph.audioEl.remove();
    }
    if (!graph.consumer.closed) {
      graph.consumer.close();
    }
  }

  public setGain(userId: number, gain: number, speakerMuted: boolean): void {
    const graph = this.graphs.get(userId);
    if (graph?.gainNode) {
      graph.gainNode.gain.value = speakerMuted ? 0 : gain;
    }
  }

  public applySpeakerMuted(
    speakerMuted: boolean,
    levels: Readonly<Record<number, number>>,
  ): void {
    for (const [userId, graph] of this.graphs) {
      if (graph.gainNode) {
        graph.gainNode.gain.value = speakerMuted ? 0 : (levels[userId] ?? 1);
      }
    }
  }

  public clear(): void {
    for (const userId of [...this.graphs.keys()]) {
      this.detach(userId);
    }
  }
}
