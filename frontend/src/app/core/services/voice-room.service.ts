import { effect, inject, Injectable, signal } from '@angular/core';
import { VoiceRoomCommon } from '@common/voice-room';
import { getStream } from '../../shared/functions/get-stream.function';
import { replaceStream } from '../../shared/functions/replace-stream.function';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { MicrophoneService } from './microphone.service';
import { SpeakerService } from './speaker.service';
import { EStorageKey } from '../../app.enums';

interface IManagedPeer extends VoiceRoomCommon.IPeer {
  rtc: RTCPeerConnection;
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
  analyserNode: AnalyserNode | null;
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
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly speakerService = inject(SpeakerService);

  private micMuted: boolean = false;
  private soundMuted: boolean = false;

  private readonly _peers = signal<Readonly<IManagedPeer>[]>([]);
  public readonly peers = this._peers.asReadonly();

  private readonly _peerGainLevels = signal<Readonly<Record<number, number>>>(
    localStorage.getItemJson(EStorageKey.PEER_GAIN_LEVELS) ?? {},
  );
  public readonly peerGainLevels = this._peerGainLevels.asReadonly();

  constructor() {
    this.socket.on(VoiceRoomCommon.EEvent.SIGNAL, (data) =>
      this.onSignal(data),
    );
  }

  public async setAudioInput(device: MediaDeviceInfo | null) {
    await this.microphoneService.setDevice(device);
    const peers = this._peers();
    if (peers.length) {
      const stream = await this.microphoneService.getStream();
      peers.forEach((p) => {
        replaceStream(stream, p.rtc);
      });
    }
  }

  public async setAudioOutput(device: MediaDeviceInfo | null) {
    await this.speakerService.setDevice(device);
  }

  public async setMicMuted(micMuted: boolean) {
    this.micMuted = micMuted;
    const peers = this._peers();
    if (peers.length) {
      const stream = await this.microphoneService.getStream();
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !micMuted;
      });
    }
  }

  public setSoundMuted(soundMuted: boolean): void {
    this.soundMuted = soundMuted;
    const peers = this._peers();
    const peerGainLevels = this._peerGainLevels();
    peers.forEach((peer) => {
      if (peer.gainNode) {
        const gain = peerGainLevels[peer.id] ?? 1;
        peer.gainNode.gain.value = soundMuted ? 0 : gain;
      }
    });
  }

  public setPeerGain(peerId: number, gain: number): void {
    this._peerGainLevels.update((levels) => ({
      ...levels,
      [peerId]: gain,
    }));
    const peers = this._peers();
    const peer = peers.find((p) => p.id === peerId);
    if (peer && peer.gainNode && !this.soundMuted) {
      peer.gainNode.gain.value = gain;
    }
  }

  public async addPeer(peer: VoiceRoomCommon.IPeer, initiator: boolean) {
    const rtc = new RTCPeerConnection({
      // iceServers: [
      //   { urls: 'stun:stun.l.google.com:19302' },
      //   { urls: 'stun:stun.chathelp.ru:3478' },
      //   { urls: 'stun:stun2.l.google.com:19302' },
      // ],
    });

    this._peers.update((peers) => [
      ...peers,
      {
        ...peer,
        rtc,
        sourceNode: null,
        gainNode: null,
        analyserNode: null,
      },
    ]);

    const stream = await this.microphoneService.getStream();

    stream.getTracks().forEach((t) => {
      t.enabled = !this.micMuted;
      rtc.addTrack(t, stream);
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
    const peers = this._peers();
    const peerIndex = peers.findIndex((p) => p.id === peer.id);
    const _peer = peers[peerIndex];
    if (_peer) {
      _peer?.sourceNode?.disconnect?.();
      _peer?.gainNode?.disconnect?.();
      _peer?.analyserNode?.disconnect?.();
      _peer.rtc.close();
      this._peers.update((peers) => peers.filter((p) => p.id !== peer.id));
    }
  }

  public async removeAllPeers() {
    const peers = this._peers();
    peers.forEach((p) => {
      p?.sourceNode?.disconnect?.();
      p?.gainNode?.disconnect?.();
      p?.analyserNode?.disconnect?.();
      p.rtc.close();
    });
    this._peers.set([]);
  }

  private async onSignal({ from, payload }: VoiceRoomCommon.ISignal) {
    const peers = this._peers();
    const peer = peers.find((p) => p.clientId === from);
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
    const peers = this._peers();
    const peerIndex = peers.findIndex((p) => p.id === peerId);
    let peer = peers[peerIndex];

    if (!peer) {
      console.error('Peer not found!', peerId);
      return;
    }

    const peerGainLevels = this._peerGainLevels();
    const gain = peerGainLevels[peerId] ?? 1;

    peer.sourceNode?.disconnect?.();
    peer.gainNode?.disconnect?.();
    peer.analyserNode?.disconnect?.();

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

    const context = await this.speakerService.getContext();

    const sourceNode = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.value = this.soundMuted ? 0 : gain;
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 128;

    sourceNode.connect(gainNode);
    sourceNode.connect(analyserNode);
    gainNode.connect(context.destination);

    peer = {
      ...peer,
      sourceNode,
      gainNode,
      analyserNode,
    };

    this._peers.update((peers) => {
      peers = [...peers];
      peers[peerIndex] = peer;
      return peers;
    });

    // Проверяем, есть ли звук в потоке (создаем анализатор)
    // const analyser = context.createAnalyser();
    // analyser.fftSize = 128;
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
