import { voiceBitrateFloorKbps } from './const';

export enum EVoiceQualityTier {
  EXCELLENT = 0,
  GOOD = 1,
  UNSTABLE = 2,
  BAD = 3,
}

export const VOICE_QUALITY_FACTORS: Record<EVoiceQualityTier, number> = {
  [EVoiceQualityTier.EXCELLENT]: 1.0,
  [EVoiceQualityTier.GOOD]: 0.625,
  [EVoiceQualityTier.UNSTABLE]: 0.375,
  [EVoiceQualityTier.BAD]: 0.25,
};

/**
 * Live video bitrate caps per voice quality tier, in bits per second.
 * Tier 0: unconstrained (null).
 * Tier 1: 1 200 000 bps.
 * Tier 2: 400 000 bps.
 * Tier 3: video/screen paused (0 bps).
 */
export const VOICE_QUALITY_VIDEO_CAPS: Record<
  EVoiceQualityTier,
  number | null
> = {
  [EVoiceQualityTier.EXCELLENT]: null,
  [EVoiceQualityTier.GOOD]: 1_200_000,
  [EVoiceQualityTier.UNSTABLE]: 400_000,
  [EVoiceQualityTier.BAD]: 0,
};

export const VOICE_QUALITY_SAMPLE_INTERVAL_MS = 2000;
export const VOICE_QUALITY_FAST_DOWN_SAMPLES = 2;
export const VOICE_QUALITY_SLOW_UP_SAMPLES = 8;
export const VOICE_QUALITY_UP_DWELL_MS = 10_000;

export type TVoiceLadderEntry = {
  tier: EVoiceQualityTier;
  kbps: number;
};

export type TVoiceQualitySample = {
  score: number | null;
  /** Packet loss in percent (0..100). */
  loss: number | null;
  /** Round-trip time in milliseconds. */
  rttMs: number | null;
  /** Jitter in milliseconds. */
  jitterMs: number | null;
};

export type TVoiceQualityState = {
  currentTier: EVoiceQualityTier;
  consecutiveDownSamples: number;
  pendingDowngradeTier: EVoiceQualityTier | null;
  consecutiveUpSamples: number;
  lastChangeMs: number;
};

export type TVoiceTierThresholds = {
  scoreMax: number;
  lossMin: number;
  rttMinMs: number;
  jitterMinMs?: number;
};

export const VOICE_TIER_THRESHOLDS: Record<
  EVoiceQualityTier.GOOD | EVoiceQualityTier.UNSTABLE | EVoiceQualityTier.BAD,
  TVoiceTierThresholds
> = {
  [EVoiceQualityTier.BAD]: {
    scoreMax: 3,
    lossMin: 15,
    rttMinMs: 600,
  },
  [EVoiceQualityTier.UNSTABLE]: {
    scoreMax: 5,
    lossMin: 8,
    rttMinMs: 350,
    jitterMinMs: 80,
  },
  [EVoiceQualityTier.GOOD]: {
    scoreMax: 7,
    lossMin: 3,
    rttMinMs: 200,
    jitterMinMs: 40,
  },
};

/**
 * Builds the voice quality ladder for a given base bitrate (kbps).
 * Bitrate per tier = max(8, round(base * factor)).
 * Drops duplicate tiers having the same bitrate as the previous kept tier,
 * then reassigns tiers:
 * - 1 kept entry: Tier 0
 * - 2 kept entries: Tiers 0, 3
 * - 3 kept entries: Tiers 0, 1, 3
 * - 4 kept entries: Tiers 0, 1, 2, 3
 */
export function buildVoiceLadder(baseKbps: number): TVoiceLadderEntry[] {
  const orderedTiers = [
    EVoiceQualityTier.EXCELLENT,
    EVoiceQualityTier.GOOD,
    EVoiceQualityTier.UNSTABLE,
    EVoiceQualityTier.BAD,
  ];

  const rawRates = orderedTiers.map((tier) =>
    Math.max(
      voiceBitrateFloorKbps,
      Math.round(baseKbps * VOICE_QUALITY_FACTORS[tier]),
    ),
  );

  const keptRates: number[] = [];
  for (const rate of rawRates) {
    if (keptRates.length === 0 || rate < keptRates[keptRates.length - 1]) {
      keptRates.push(rate);
    }
  }

  const count = keptRates.length;
  if (count <= 1) {
    return [{ tier: EVoiceQualityTier.EXCELLENT, kbps: keptRates[0] }];
  }

  if (count === 2) {
    return [
      { tier: EVoiceQualityTier.EXCELLENT, kbps: keptRates[0] },
      { tier: EVoiceQualityTier.BAD, kbps: keptRates[1] },
    ];
  }

  if (count === 3) {
    return [
      { tier: EVoiceQualityTier.EXCELLENT, kbps: keptRates[0] },
      { tier: EVoiceQualityTier.GOOD, kbps: keptRates[1] },
      { tier: EVoiceQualityTier.BAD, kbps: keptRates[2] },
    ];
  }

  return [
    { tier: EVoiceQualityTier.EXCELLENT, kbps: keptRates[0] },
    { tier: EVoiceQualityTier.GOOD, kbps: keptRates[1] },
    { tier: EVoiceQualityTier.UNSTABLE, kbps: keptRates[2] },
    { tier: EVoiceQualityTier.BAD, kbps: keptRates[3] },
  ];
}

export function createInitialVoiceQualityState(
  initialTier: EVoiceQualityTier = EVoiceQualityTier.EXCELLENT,
  nowMs = 0,
): TVoiceQualityState {
  return {
    currentTier: initialTier,
    consecutiveDownSamples: 0,
    pendingDowngradeTier: null,
    consecutiveUpSamples: 0,
    lastChangeMs: nowMs,
  };
}

function sampleTriggersTier(
  sample: TVoiceQualitySample,
  thresholds: TVoiceTierThresholds,
): boolean {
  if (sample.score !== null && sample.score <= thresholds.scoreMax) {
    return true;
  }
  if (sample.loss !== null && sample.loss >= thresholds.lossMin) {
    return true;
  }
  if (sample.rttMs !== null && sample.rttMs >= thresholds.rttMinMs) {
    return true;
  }
  if (
    thresholds.jitterMinMs !== undefined &&
    sample.jitterMs !== null &&
    sample.jitterMs >= thresholds.jitterMinMs
  ) {
    return true;
  }
  return false;
}

function determineSampleTargetTier(
  ladder: readonly TVoiceLadderEntry[],
  sample: TVoiceQualitySample,
): EVoiceQualityTier | null {
  // Check kept ladder tiers from worst to best
  for (let i = ladder.length - 1; i >= 1; i--) {
    const tier = ladder[i].tier;
    if (tier in VOICE_TIER_THRESHOLDS) {
      const thresholds =
        VOICE_TIER_THRESHOLDS[tier as keyof typeof VOICE_TIER_THRESHOLDS];
      if (sampleTriggersTier(sample, thresholds)) {
        return tier;
      }
    }
  }

  // If no degradation thresholds triggered, check if we actually have sample data
  const hasData =
    sample.score !== null ||
    sample.loss !== null ||
    sample.rttMs !== null ||
    sample.jitterMs !== null;

  if (!hasData) {
    return null;
  }

  return ladder[0].tier;
}

function sampleSatisfiesUpMargin(
  currentTier: EVoiceQualityTier,
  sample: TVoiceQualitySample,
): boolean {
  if (currentTier === EVoiceQualityTier.EXCELLENT) {
    return false;
  }

  // Missing stats or score count as no information; never go up
  if (sample.score === null || sample.loss === null) {
    return false;
  }

  const thresholds =
    VOICE_TIER_THRESHOLDS[currentTier as keyof typeof VOICE_TIER_THRESHOLDS];
  if (!thresholds) {
    return false;
  }

  // Margin conditions:
  // - score at least 2 above the current tier threshold
  // - loss below half the current tier threshold
  // - RTT and jitter below 80% of current tier threshold
  if (sample.score < thresholds.scoreMax + 2) {
    return false;
  }
  if (sample.loss >= thresholds.lossMin / 2) {
    return false;
  }
  if (sample.rttMs !== null && sample.rttMs >= thresholds.rttMinMs * 0.8) {
    return false;
  }
  if (
    thresholds.jitterMinMs !== undefined &&
    sample.jitterMs !== null &&
    sample.jitterMs >= thresholds.jitterMinMs * 0.8
  ) {
    return false;
  }

  return true;
}

/**
 * Pure hysteresis function evaluating a 2 s quality sample against the current voice ladder.
 * - Fast down: a worse target seen in 2 consecutive samples moves directly to that target
 *   (or the common worse target held across both samples).
 * - Slow up: 1 ladder entry at a time after 8 consecutive samples with margin and >= 10 s dwell time.
 * - Missing stats or score count as no information: keep current tier, never go up.
 */
export function evaluateVoiceQuality(
  ladder: readonly TVoiceLadderEntry[],
  state: TVoiceQualityState,
  sample: TVoiceQualitySample,
  nowMs: number,
): TVoiceQualityState {
  if (ladder.length <= 1) {
    return {
      ...state,
      currentTier: ladder[0]?.tier ?? EVoiceQualityTier.EXCELLENT,
      consecutiveDownSamples: 0,
      pendingDowngradeTier: null,
      consecutiveUpSamples: 0,
    };
  }

  const currentTierIndex = ladder.findIndex(
    (entry) => entry.tier === state.currentTier,
  );
  const safeCurrentIndex = currentTierIndex >= 0 ? currentTierIndex : 0;
  const currentTier = ladder[safeCurrentIndex].tier;

  const targetTier = determineSampleTargetTier(ladder, sample);

  // If no information, maintain current state without progressing up or down
  if (targetTier === null) {
    return {
      ...state,
      currentTier,
      consecutiveDownSamples: 0,
      pendingDowngradeTier: null,
      consecutiveUpSamples: 0,
    };
  }

  const targetTierIndex = ladder.findIndex(
    (entry) => entry.tier === targetTier,
  );
  const safeTargetIndex = targetTierIndex >= 0 ? targetTierIndex : 0;

  // --- DOWN CHECK ---
  if (safeTargetIndex > safeCurrentIndex) {
    // Target is worse than current tier
    if (
      state.consecutiveDownSamples >= 1 &&
      state.pendingDowngradeTier !== null
    ) {
      const pendingIndex = ladder.findIndex(
        (entry) => entry.tier === state.pendingDowngradeTier,
      );
      // Both consecutive samples saw a worse target; move to the common worse target
      const resolvedDownIndex = Math.min(
        safeTargetIndex,
        pendingIndex >= 0 ? pendingIndex : safeTargetIndex,
      );
      const newTier = ladder[resolvedDownIndex].tier;
      return {
        currentTier: newTier,
        consecutiveDownSamples: 0,
        pendingDowngradeTier: null,
        consecutiveUpSamples: 0,
        lastChangeMs: nowMs,
      };
    }

    return {
      ...state,
      currentTier,
      consecutiveDownSamples: 1,
      pendingDowngradeTier: targetTier,
      consecutiveUpSamples: 0,
    };
  }

  // --- UP CHECK ---
  if (safeCurrentIndex > 0 && sampleSatisfiesUpMargin(currentTier, sample)) {
    const nextUpSamples = state.consecutiveUpSamples + 1;
    const dwellElapsed =
      nowMs - state.lastChangeMs >= VOICE_QUALITY_UP_DWELL_MS;

    if (nextUpSamples >= VOICE_QUALITY_SLOW_UP_SAMPLES && dwellElapsed) {
      // Step up one ladder entry
      const newIndex = safeCurrentIndex - 1;
      return {
        currentTier: ladder[newIndex].tier,
        consecutiveDownSamples: 0,
        pendingDowngradeTier: null,
        consecutiveUpSamples: 0,
        lastChangeMs: nowMs,
      };
    }

    return {
      ...state,
      currentTier,
      consecutiveDownSamples: 0,
      pendingDowngradeTier: null,
      consecutiveUpSamples: nextUpSamples,
    };
  }

  // Neither a downgrade condition nor meeting up margin: keep current tier, reset counters
  return {
    ...state,
    currentTier,
    consecutiveDownSamples: 0,
    pendingDowngradeTier: null,
    consecutiveUpSamples: 0,
  };
}
