import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { Consumer, Producer, WebRtcTransport } from 'mediasoup/types';

type Peer = {
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};

@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker: mediasoup.types.Worker;
  private routers = new Map<string, mediasoup.types.Router>();

  public readonly peers = new Map<string, Peer>();

  async onModuleInit() {
    this.worker = await mediasoup.createWorker({
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });
    console.info('Mediasoup worker started');
  }

  async ensureRouter(roomId: number) {
    let router = this.routers.get(roomId.toString());
    if (router) {
      return router;
    }
    router = await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
      ],
    });
    this.routers.set(roomId.toString(), router);
    return router;
  }

  removeRouter(roomId: string) {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
    }
  }
}
