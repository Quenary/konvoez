import { inject, Injectable, Injector } from '@angular/core';
import { EVoiceRoomEvent, IVoiceRoomCloseConsumer } from '@konvoez/shared';
import type { Consumer } from 'mediasoup-client/types';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { MediasoupSessionService } from './mediasoup-session.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { PeerVideoService } from './peer-video.service';

/**
 * Opt-in screen watch: which peers are being watched and their screen-audio
 * consumers. MediasoupSessionService still opens the recv transport.
 */
@Injectable({ providedIn: 'root' })
export class ScreenWatchService {
  private readonly injector = inject(Injector);
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly peerScreenAudioService = inject(PeerScreenAudioService);

  /** Screen-audio consumers by remote user id, so stop-watching can close them. */
  private readonly screenAudioConsumers = new Map<number, Consumer>();

  private get mediasoupSessionService(): MediasoupSessionService {
    return this.injector.get(MediasoupSessionService);
  }

  public async watchScreen(
    userId: number,
    resolvePeer: (
      userId: number,
    ) => { gain: number; speakerMuted: boolean } | null,
    screenGain: number,
  ): Promise<void> {
    if (this.peerVideoService.isWatching(userId)) {
      return;
    }
    const available = this.peerVideoService.availableScreens()[userId];
    if (!available?.videoProducerId) {
      throw new Error('No screen share available for peer');
    }
    const peer = resolvePeer(userId);
    if (!peer) {
      throw new Error('Peer not found');
    }

    await this.mediasoupSessionService.consumeProducer(
      {
        producerId: available.videoProducerId,
        userId,
        kind: 'video',
        mediaTag: 'screen',
      },
      resolvePeer,
    );

    if (available.audioProducerId) {
      await this.mediasoupSessionService.consumeProducer(
        {
          producerId: available.audioProducerId,
          userId,
          kind: 'audio',
          mediaTag: 'screen-audio',
        },
        resolvePeer,
        { screenGain },
      );
    }
  }

  public async stopWatchingScreen(userId: number): Promise<void> {
    const consumerIds: string[] = [];
    const videoId = this.peerVideoService.getScreenConsumerId(userId);
    if (videoId) {
      consumerIds.push(videoId);
    }
    const audioId =
      this.screenAudioConsumers.get(userId)?.id ??
      this.peerScreenAudioService.getConsumerId(userId);
    if (audioId) {
      consumerIds.push(audioId);
    }

    for (const consumerId of consumerIds) {
      try {
        await this.socket.emitWithAck(EVoiceRoomEvent.CLOSE_CONSUMER, {
          consumerId,
        } satisfies IVoiceRoomCloseConsumer);
      } catch (error) {
        console.warn('close-consumer ack failed', error);
      }
    }

    this.release(userId);
  }

  public rememberAudioConsumer(userId: number, consumer: Consumer): void {
    const previous = this.screenAudioConsumers.get(userId);
    if (previous && previous !== consumer && !previous.closed) {
      previous.close();
    }
    this.screenAudioConsumers.set(userId, consumer);
  }

  public release(userId: number): void {
    this.peerVideoService.stopWatchingLocal(userId);
    this.screenAudioConsumers.delete(userId);
    this.peerScreenAudioService.detach(userId);
  }

  public onRemoteProducerClosed(userId: number, producerId: string): void {
    this.peerScreenAudioService.remove(userId, producerId);
    const audioConsumer = this.screenAudioConsumers.get(userId);
    if (audioConsumer?.producerId === producerId) {
      this.screenAudioConsumers.delete(userId);
    }
    const available = this.peerVideoService.availableScreens()[userId];
    if (available?.videoProducerId === producerId) {
      this.release(userId);
    }
  }

  public onConsumerClosed(consumerId: string): boolean {
    for (const [userId, consumer] of this.screenAudioConsumers) {
      if (consumer.id !== consumerId) {
        continue;
      }
      this.screenAudioConsumers.delete(userId);
      this.peerScreenAudioService.detach(userId);
      return true;
    }
    return false;
  }

  public clear(): void {
    this.screenAudioConsumers.clear();
  }
}
