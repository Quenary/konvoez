import { inject, Injectable } from '@angular/core';
import { EVoiceRoomEvent, IVoiceRoomCloseConsumer } from '@konvoez/shared';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { emitVoiceRoomWithAck } from './voice-room-socket-ack';
import { MediasoupSessionService } from './mediasoup-session.service';
import { PeerScreenAudioService } from './peer-screen-audio.service';
import { PeerVideoService } from './peer-video.service';

/**
 * Opt-in screen watch. Screen-audio consumers stay in PeerScreenAudioService.
 * MediasoupSessionService still opens the recv transport.
 */
@Injectable({ providedIn: 'root' })
export class ScreenWatchService {
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly peerScreenAudioService = inject(PeerScreenAudioService);
  private readonly mediasoupSessionService = inject(MediasoupSessionService);

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
      { rethrow: true },
    );

    if (available.audioProducerId) {
      try {
        await this.mediasoupSessionService.consumeProducer(
          {
            producerId: available.audioProducerId,
            userId,
            kind: 'audio',
            mediaTag: 'screen-audio',
          },
          resolvePeer,
          { screenGain, rethrow: true },
        );
      } catch (error) {
        console.warn('Screen audio failed after video subscribed', error);
      }
    }
  }

  public async stopWatchingScreen(userId: number): Promise<void> {
    const consumerIds: string[] = [];
    const videoId = this.peerVideoService.getScreenConsumerId(userId);
    if (videoId) {
      consumerIds.push(videoId);
    }
    const audioId = this.peerScreenAudioService.getConsumerId(userId);
    if (audioId) {
      consumerIds.push(audioId);
    }

    for (const consumerId of consumerIds) {
      try {
        await emitVoiceRoomWithAck(
          this.socket,
          EVoiceRoomEvent.CLOSE_CONSUMER,
          {
            consumerId,
          } satisfies IVoiceRoomCloseConsumer,
        );
      } catch (error) {
        console.warn('close-consumer ack failed', error);
      }
    }

    this.release(userId);
  }

  public release(userId: number): void {
    this.peerVideoService.stopWatchingLocal(userId);
    this.peerScreenAudioService.detach(userId);
  }

  public onRemoteProducerClosed(userId: number, producerId: string): void {
    const available = this.peerVideoService.availableScreens()[userId];
    if (!available) {
      return;
    }
    if (available.audioProducerId === producerId) {
      this.peerScreenAudioService.remove(userId, producerId);
      return;
    }
    if (available.videoProducerId === producerId) {
      this.release(userId);
    }
  }
}
