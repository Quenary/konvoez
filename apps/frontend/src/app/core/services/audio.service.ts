import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private readonly notificationAudio = new Audio();
  private readonly peerJoinAudio = new Audio();
  private readonly peerLeaveAudio = new Audio();
  private readonly muteAudio = new Audio();

  constructor() {
    this.notificationAudio.src =
      'audio/dragon-studio-notification-ping-372479.mp3';
    this.peerJoinAudio.src =
      'audio/dragon-studio-new-notification-3-398649.mp3';
    this.peerLeaveAudio.src =
      'audio/dragon-studio-new-notification-3-398649.mp3';
    this.muteAudio.src = 'audio/creatorshome-digital-click-357350.mp3';
  }

  public playNotificationAudio(): void {
    this.notificationAudio.currentTime = 0;
    this.notificationAudio.play();
  }

  public playPeerJoinAudio(): void {
    this.peerJoinAudio.currentTime = 0;
    this.peerJoinAudio.play();
  }

  public playPeerLeaveAudio(): void {
    this.peerLeaveAudio.currentTime = 0;
    this.peerLeaveAudio.play();
  }

  public playMuteAudio(): void {
    this.muteAudio.currentTime = 0;
    this.muteAudio.play();
  }
}
