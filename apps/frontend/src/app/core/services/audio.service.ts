import { Injectable } from '@angular/core';

interface IToneOptions {
  frequency: number;
  /** Optional glide target frequency. */
  frequencyEnd?: number;
  type?: OscillatorType;
  /** Start offset in seconds from `AudioContext.currentTime`. */
  when?: number;
  duration: number;
  peak?: number;
  attack?: number;
  /**
   * Hold peak until this many seconds after start, then release to the end.
   * When omitted, decay starts right after attack (pluck-style envelope).
   */
  sustainUntil?: number;
  /** Exponential release floor; must be > 0. */
  releaseTo?: number;
}

/** Shared harmonic palette for UI cues. */
const F = {
  dial: 425,
  mute: 560,
  leaveLow: 523.25, // C5
  leaveHigh: 659.25, // E5
  joinLow: 648,
  joinHigh: 864,
  notifyLow: 880,
  notifyHigh: 1320,
  chord: [523.25, 659.25, 783.99] as const, // C5 E5 G5
} as const;

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private audioContext: AudioContext | null = null;
  private dialingInterval: ReturnType<typeof setInterval> | null = null;
  private ringtoneInterval: ReturnType<typeof setInterval> | null = null;

  public playNotificationAudio(): void {
    this.playNotes([
      { frequency: F.notifyLow, when: 0, duration: 0.14, peak: 0.13 },
      { frequency: F.notifyHigh, when: 0.11, duration: 0.2, peak: 0.12 },
    ]);
  }

  public playPeerJoinAudio(): void {
    this.playNotes([
      { frequency: F.joinLow, when: 0, duration: 0.12, peak: 0.12 },
      { frequency: F.joinHigh, when: 0.1, duration: 0.16, peak: 0.11 },
    ]);
  }

  public playPeerLeaveAudio(): void {
    this.playNotes([
      { frequency: F.leaveHigh, when: 0, duration: 0.12, peak: 0.1 },
      { frequency: F.leaveLow, when: 0.1, duration: 0.16, peak: 0.09 },
    ]);
  }

  public playMuteAudio(): void {
    this.playTone({
      frequency: F.mute,
      duration: 0.05,
      peak: 0.16,
      attack: 0.005,
    });
  }

  public startOutgoingDialing(): void {
    this.stopOutgoingDialing();
    const playBeep = () => {
      this.playTone({
        frequency: F.dial,
        duration: 1.3,
        peak: 0.12,
        attack: 0.05,
        sustainUntil: 1.2,
      });
    };

    playBeep();
    this.dialingInterval = setInterval(playBeep, 4000);
  }

  public stopOutgoingDialing(): void {
    if (this.dialingInterval) {
      clearInterval(this.dialingInterval);
      this.dialingInterval = null;
    }
  }

  public startIncomingRingtone(): void {
    this.stopIncomingRingtone();
    const playChord = () => {
      this.playNotes(
        F.chord.map((frequency, idx) => ({
          frequency,
          when: idx * 0.1,
          duration: 0.6,
          peak: 0.08,
          attack: 0.04,
        })),
      );
    };

    playChord();
    this.ringtoneInterval = setInterval(playChord, 2500);
  }

  public stopIncomingRingtone(): void {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  public playCallEndSound(): void {
    this.stopOutgoingDialing();
    this.stopIncomingRingtone();
    this.playNotes(
      [0, 0.18, 0.36].map((when) => ({
        frequency: F.dial,
        when,
        duration: 0.13,
        peak: 0.12,
        attack: 0.02,
      })),
    );
  }

  private playNotes(notes: IToneOptions[]): void {
    for (const note of notes) {
      this.playTone(note);
    }
  }

  private playTone(options: IToneOptions): void {
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const when = now + (options.when ?? 0);
      const duration = options.duration;
      const peak = options.peak ?? 0.12;
      const attack = options.attack ?? 0.01;
      const releaseTo = options.releaseTo ?? 0.001;
      const type = options.type ?? 'sine';
      const end = when + duration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(options.frequency, when);
      if (options.frequencyEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(options.frequencyEnd, 1),
          end,
        );
      }

      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(peak, when + attack);

      if (options.sustainUntil !== undefined) {
        const sustainEnd = when + options.sustainUntil;
        gain.gain.linearRampToValueAtTime(peak, sustainEnd);
        // Linear release to silence for long sustained tones (dial).
        gain.gain.linearRampToValueAtTime(0, end);
      } else {
        gain.gain.exponentialRampToValueAtTime(
          releaseTo,
          when + Math.max(duration, attack + 0.02),
        );
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(end + 0.02);
    } catch (err) {
      console.warn('Failed to play tone', err);
    }
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }
}
