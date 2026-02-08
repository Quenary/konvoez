import { Injectable } from '@angular/core';
import { SignalingService } from './signaling.service';

@Injectable({ providedIn: 'root' })
export class WebrtcService {
  peers = new Map<string, RTCPeerConnection>();
  localStream!: MediaStream;

  constructor(private signaling: SignalingService) {}

  async init(roomId: string) {
    this.signaling.connect();

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const s = this.signaling.socket;

    s.on('existing-peers', (peers: string[]) => {
      peers.forEach(peerId => this.createPeer(peerId, true));
    });

    s.on('new-peer', ({ peerId }) => {
      this.createPeer(peerId, false);
    });

    s.on('signal', async ({ from, payload }) => {
      const pc = this.peers.get(from);
      if (!pc) return;

      if (payload.sdp) {
        await pc.setRemoteDescription(payload.sdp);
        if (payload.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.signaling.signal(from, { sdp: answer });
        }
      }

      if (payload.candidate) {
        await pc.addIceCandidate(payload.candidate);
      }
    });

    this.signaling.joinRoom(roomId);
  }

  private createPeer(peerId: string, initiator: boolean) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.localStream.getTracks().forEach(t =>
      pc.addTrack(t, this.localStream)
    );

    pc.onicecandidate = e => {
      if (e.candidate) {
        this.signaling.signal(peerId, { candidate: e.candidate });
      }
    };

    pc.ontrack = e => {
      const audio = document.createElement('audio');
      audio.srcObject = e.streams[0];
      audio.autoplay = true;
      document.body.appendChild(audio);
    };

    this.peers.set(peerId, pc);

    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        this.signaling.signal(peerId, { sdp: offer });
      });
    }
  }
}
