import { DestroyRef, inject, Injectable, Signal, signal } from '@angular/core';
import {
  createInitialVoiceQualityState,
  DEFAULT_VOICE_MAX_BITRATE_KBPS,
  evaluateVoiceQuality,
  EVoiceQualityTier,
  TVoiceLadderEntry,
  TVoiceQualitySample,
  TVoiceQualityState,
  VOICE_QUALITY_SAMPLE_INTERVAL_MS,
} from '@konvoez/shared';

export interface IVoiceQualityAdapter {
  readSample: () => Promise<TVoiceQualitySample>;
  applyQualityLevel: (entry: TVoiceLadderEntry) => Promise<void>;
}

@Injectable({
  providedIn: 'root',
})
export class VoiceQualityService {
  private readonly destroyRef = inject(DestroyRef);

  public readonly tier: Signal<EVoiceQualityTier>;
  public readonly bitrateKbps: Signal<number>;

  private readonly _tier = signal<EVoiceQualityTier>(
    EVoiceQualityTier.EXCELLENT,
  );
  private readonly _bitrateKbps = signal<number>(
    DEFAULT_VOICE_MAX_BITRATE_KBPS,
  );
  private ladder: readonly TVoiceLadderEntry[] = [];
  private adapter: IVoiceQualityAdapter | null = null;
  private state: TVoiceQualityState = createInitialVoiceQualityState();
  private intervalRef: ReturnType<typeof setInterval> | null = null;
  private isTickInProgress = false;
  private sessionGeneration = 0;

  constructor() {
    this.tier = this._tier.asReadonly();
    this.bitrateKbps = this._bitrateKbps.asReadonly();

    this.destroyRef.onDestroy(() => {
      this.stop();
    });
  }

  public start(
    ladder: readonly TVoiceLadderEntry[],
    adapter: IVoiceQualityAdapter,
  ): void {
    this.stop();

    this.sessionGeneration++;
    this.ladder = ladder;
    this.adapter = adapter;
    const initialEntry = ladder[0] ?? {
      tier: EVoiceQualityTier.EXCELLENT,
      kbps: DEFAULT_VOICE_MAX_BITRATE_KBPS,
    };

    this.state = createInitialVoiceQualityState(initialEntry.tier, Date.now());
    this._tier.set(initialEntry.tier);
    this._bitrateKbps.set(initialEntry.kbps);

    // Single-entry ladder has no adaptation tiers; loop is not started.
    if (ladder.length <= 1) {
      return;
    }

    this.intervalRef = setInterval(() => {
      void this.tick();
    }, VOICE_QUALITY_SAMPLE_INTERVAL_MS);
  }

  public stop(): void {
    this.sessionGeneration++;
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    this.ladder = [];
    this.adapter = null;
    this.state = createInitialVoiceQualityState();
    this._tier.set(EVoiceQualityTier.EXCELLENT);
    this._bitrateKbps.set(DEFAULT_VOICE_MAX_BITRATE_KBPS);
    this.isTickInProgress = false;
  }

  private async tick(): Promise<void> {
    const generation = this.sessionGeneration;
    const adapter = this.adapter;
    if (this.isTickInProgress || this.ladder.length <= 1 || !adapter) {
      return;
    }

    this.isTickInProgress = true;
    try {
      const sample = await adapter.readSample();
      if (this.sessionGeneration !== generation || !this.adapter) {
        return;
      }

      const previousTier = this.state.currentTier;
      const nextState = evaluateVoiceQuality(
        this.ladder,
        this.state,
        sample,
        Date.now(),
      );
      this.state = nextState;

      if (nextState.currentTier !== previousTier) {
        const nextEntry =
          this.ladder.find((entry) => entry.tier === nextState.currentTier) ??
          this.ladder[0];

        this._tier.set(nextEntry.tier);
        this._bitrateKbps.set(nextEntry.kbps);

        if (this.adapter && this.sessionGeneration === generation) {
          await this.adapter.applyQualityLevel(nextEntry);
        }
      }
    } catch (error) {
      console.warn('Voice quality tick failed', error);
    } finally {
      if (this.sessionGeneration === generation) {
        this.isTickInProgress = false;
      }
    }
  }
}
