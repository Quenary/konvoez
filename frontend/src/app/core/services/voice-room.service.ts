import { inject, Injectable } from '@angular/core';
import { VoiceRoomCommon } from '@common/voice-room';
import { getStream } from '../../shared/functions/get-stream.function';
import { replaceStream } from '../../shared/functions/replace-stream.function';
import { SocketInjectionToken } from './socket-io.token';

interface IManagedPeer extends VoiceRoomCommon.IPeer {
  rtc: RTCPeerConnection;
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
}

/**
 * Helper service for active voice room
 * - managing rtc peers
 * - managing audio context
 */
@Injectable({
  providedIn: 'root',
})
export class VoiceRoomService {
  private readonly socket = inject(SocketInjectionToken);

  private audioContext!: AudioContext;
  private inputDevice: MediaDeviceInfo | null = null;
  private outputDevice: MediaDeviceInfo | null = null;
  private micMuted: boolean = false;
  private soundMuted: boolean = false;
  private inputStream: MediaStream | null = null;
  private peers: IManagedPeer[] = [];

  constructor() {
    this.socket.on(VoiceRoomCommon.EEvent.SIGNAL, (data) =>
      this.onSignal(data),
    );
  }

  /**
   * Create (or recreate) audio context if needed
   * and configure it
   */
  public async handleContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    } else if (
      this.audioContext.state === 'closed' ||
      this.audioContext.state === 'interrupted'
    ) {
      try {
        await this.audioContext.close();
      } catch {}
      this.audioContext = new AudioContext();
    }
    this.setSinkId(this.outputDevice);
  }

  public async setAudioInput(device: MediaDeviceInfo | null) {
    this.inputDevice = device;
    if (this.audioContext && this.peers.length) {
      this.inputStream = await getStream(device);
      this.peers.forEach((p) => {
        replaceStream(this.inputStream as MediaStream, p.rtc);
      });
    }
  }

  public async setAudioOutput(device: MediaDeviceInfo | null): Promise<void> {
    this.outputDevice = device;
    this.handleContext();
    this.setSinkId(device);
  }

  private async setSinkId(device: MediaDeviceInfo | null) {
    if (
      device &&
      'setSinkId' in this.audioContext &&
      typeof this.audioContext.setSinkId == 'function'
    ) {
      return await this.audioContext.setSinkId(device.deviceId);
    }
  }

  public setMicMuted(micMuted: boolean): void {
    this.micMuted = micMuted;
    if (this.inputStream) {
      this.inputStream.getAudioTracks().forEach((track) => {
        track.enabled = !micMuted;
      });
    }
  }

  public setSoundMuted(soundMuted: boolean): void {
    this.soundMuted = soundMuted;
    this.peers.forEach((peer) => {
      if (peer.gainNode) {
        peer.gainNode.gain.value = soundMuted ? 0 : 1;
      }
    });
  }

  public async addPeer(peer: VoiceRoomCommon.IPeer, initiator: boolean) {
    const rtc = new RTCPeerConnection({
      // iceServers: [
      //   { urls: 'stun:stun.l.google.com:19302' },
      //   { urls: 'stun:stun.chathelp.ru:3478' },
      //   { urls: 'stun:stun2.l.google.com:19302' },
      // ],
    });

    this.peers.push({
      ...peer,
      rtc,
      sourceNode: null,
      gainNode: null,
    });

    if (!this.inputStream) {
      this.inputStream = await getStream(this.inputDevice);
    }

    this.inputStream.getTracks().forEach((t) => {
      t.enabled = !this.micMuted;
      rtc.addTrack(t, this.inputStream as MediaStream);
    });

    rtc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit(VoiceRoomCommon.EEvent.SIGNAL, {
          to: peer.clientId,
          payload: {
            candidate: e.candidate,
          },
        });
      }
    };

    rtc.ontrack = (event) => {
      this.onTrack(peer.id, event);
    };

    if (initiator) {
      const offer = await rtc.createOffer();
      await rtc.setLocalDescription(offer);
      this.socket.emit(VoiceRoomCommon.EEvent.SIGNAL, {
        to: peer.clientId,
        payload: {
          sdi: offer,
        },
      });
    }
  }

  public async removePeer(peer: VoiceRoomCommon.IPeer) {
    const peerIndex = this.peers.findIndex((p) => p.id === peer.id);
    const _peer = this.peers[peerIndex];
    if (_peer) {
      _peer?.sourceNode?.disconnect?.();
      _peer?.gainNode?.disconnect?.();
      _peer.rtc.close();
      this.peers = this.peers.filter((p) => p.id !== peer.id);
    }
  }

  public async removeAllPeers() {
    this.peers.forEach((p) => {
      p?.sourceNode?.disconnect?.();
      p?.gainNode?.disconnect?.();
      p.rtc.close();
    });
    this.peers = [];
  }

  public async onSignal({ from, payload }: VoiceRoomCommon.ISignal) {
    const peer = from && this.peers.find((p) => p.clientId === from);
    if (!peer) {
      return;
    }
    if (payload.sdi) {
      await peer.rtc.setRemoteDescription(payload.sdi);

      if (payload.sdi.type === 'offer') {
        const answer = await peer.rtc.createAnswer();
        await peer.rtc.setLocalDescription(answer);
        this.socket.emit(VoiceRoomCommon.EEvent.SIGNAL, {
          to: from,
          payload: {
            sdi: answer,
          },
        });
      }
    }
    if (payload.candidate) {
      await peer.rtc.addIceCandidate(payload.candidate);
    }
  }

  private async onTrack(peerId: number, event: RTCTrackEvent) {
    const peerIndex = this.peers.findIndex((p) => p.id === peerId);
    const peer = this.peers[peerIndex];

    if (!peer) {
      console.error('Peer not found!', peerId);
      return;
    }

    peer.sourceNode?.disconnect?.();
    peer.sourceNode = null;
    peer.gainNode?.disconnect?.();
    peer.gainNode = null;

    const stream = new MediaStream([event.track]);

    // Chrome workaround
    // https://issues.chromium.org/issues/40094084
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = false;
    audio.muted = true;
    event.track.onended = () => {
      audio.srcObject = null;
      audio.remove();
    };

    await this.handleContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const sourceNode = this.audioContext.createMediaStreamSource(stream);
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = this.soundMuted ? 0 : 1;
    sourceNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    peer.sourceNode = sourceNode;
    peer.gainNode = gainNode;

    // Проверяем, есть ли звук в потоке (создаем анализатор)
    // const analyser = this.audioContext.createAnalyser();
    // analyser.fftSize = 256;
    // sourceNode.connect(analyser); // Подключаем также к анализатору

    // const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // // Функция для проверки уровня звука
    // const checkAudioLevel = () => {
    //   analyser.getByteFrequencyData(dataArray);
    //   const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    //   console.log('Audio level:', average);
    //   if (average > 0) {
    //     console.log('✅ Audio detected! Level:', average);
    //   }
    //   // Проверяем каждые 500мс пока есть звук
    //   if (peer.sourceNode) {
    //     setTimeout(checkAudioLevel, 500);
    //   }
    // };
    // // Начинаем проверку через небольшую задержку
    // setTimeout(checkAudioLevel, 1000);
  }
}
