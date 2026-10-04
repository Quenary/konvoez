import { inject, Injectable } from '@angular/core';
import { Consumer } from 'mediasoup-client/types';
import { AudioActivityService } from './audio-activity.service';
import { SpeakerService } from './speaker.service';

interface IPeerPlaybackGraph {
  consumers: Consumer[];
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
  analyserNode: AnalyserNode | null;
  audioEl: HTMLAudioElement | null;
}

/**
 * Per-peer Web Audio playback graph (gain, analyser, Chrome dummy audio element).
 * Graphs are keyed by user id and are not stored on peer entities.
 */
@Injectable({
  providedIn: 'root',
})
export class PeerPlaybackService {
  private readonly speakerService = inject(SpeakerService);
  private readonly audioActivityService = inject(AudioActivityService);
  private readonly graphs = new Map<number, IPeerPlaybackGraph>();

  public async attach(
    userId: number,
    consumer: Consumer,
    options: { gain: number; speakerMuted: boolean },
  ): Promise<void> {
    const existing = this.graphs.get(userId);
    this.disconnectGraph(existing);

    const stream = new MediaStream([consumer.track]);

    // Chrome workaround
    // https://issues.chromium.org/issues/40094084
    const audioEl = new Audio();
    audioEl.srcObject = stream;
    audioEl.autoplay = false;
    audioEl.muted = true;

    consumer.on('trackended', () => {
      audioEl.srcObject = null;
      audioEl.remove();
    });

    const context = await this.speakerService.getContext();
    const sourceNode = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.value = options.speakerMuted ? 0 : options.gain;
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = 0.2;

    sourceNode.connect(gainNode);
    gainNode.connect(analyserNode);
    gainNode.connect(context.destination);

    this.audioActivityService.register(userId, analyserNode);

    const consumers = [...(existing?.consumers ?? []), consumer];
    this.graphs.set(userId, {
      consumers,
      sourceNode,
      gainNode,
      analyserNode,
      audioEl,
    });
  }

  public removeConsumer(userId: number, producerId: string): void {
    const graph = this.graphs.get(userId);
    if (!graph) {
      return;
    }

    const consumer = graph.consumers.find(
      (item) => item.producerId === producerId,
    );
    if (!consumer) {
      return;
    }

    consumer.close();
    this.graphs.set(userId, {
      ...graph,
      consumers: graph.consumers.filter(
        (item) => item.producerId !== producerId,
      ),
    });
  }

  public setPeerGain(
    userId: number,
    gain: number,
    speakerMuted: boolean,
  ): void {
    const graph = this.graphs.get(userId);
    if (graph?.gainNode && !speakerMuted) {
      graph.gainNode.gain.value = gain;
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

  public detach(userId: number): void {
    const graph = this.graphs.get(userId);
    if (!graph) {
      return;
    }
    this.cleanupGraph(userId, graph);
    this.graphs.delete(userId);
  }

  public detachAll(): void {
    for (const [userId, graph] of this.graphs) {
      this.cleanupGraph(userId, graph);
    }
    this.graphs.clear();
  }

  private cleanupGraph(userId: number, graph: IPeerPlaybackGraph): void {
    try {
      this.audioActivityService.unregister(userId);
      this.disconnectGraph(graph);
      graph.audioEl?.remove();
      graph.consumers.forEach((consumer) => {
        consumer.close();
      });
    } catch (error) {
      console.error('Error cleaning up peer playback', userId, error);
    }
  }

  private disconnectGraph(graph: IPeerPlaybackGraph | undefined): void {
    graph?.sourceNode?.disconnect?.();
    graph?.gainNode?.disconnect?.();
    graph?.analyserNode?.disconnect?.();
  }
}
