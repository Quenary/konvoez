import { describe, expect, it } from 'vitest';
import {
  buildVoiceLadder,
  createInitialVoiceQualityState,
  evaluateVoiceQuality,
  EVoiceQualityTier,
  TVoiceQualitySample,
} from './voice-adaptation';

describe('voice-adaptation', () => {
  describe('buildVoiceLadder', () => {
    it('builds ladder for default base 64 kbps', () => {
      const ladder = buildVoiceLadder(64);
      expect(ladder).toEqual([
        { tier: EVoiceQualityTier.EXCELLENT, kbps: 64 },
        { tier: EVoiceQualityTier.GOOD, kbps: 40 },
        { tier: EVoiceQualityTier.UNSTABLE, kbps: 24 },
        { tier: EVoiceQualityTier.BAD, kbps: 16 },
      ]);
    });

    it('builds ladder for base 24 kbps', () => {
      const ladder = buildVoiceLadder(24);
      expect(ladder).toEqual([
        { tier: EVoiceQualityTier.EXCELLENT, kbps: 24 },
        { tier: EVoiceQualityTier.GOOD, kbps: 15 },
        { tier: EVoiceQualityTier.UNSTABLE, kbps: 9 },
        { tier: EVoiceQualityTier.BAD, kbps: 8 },
      ]);
    });

    it('builds ladder for base 16 kbps (collapsed to 3 tiers: 0, 1, 3)', () => {
      const ladder = buildVoiceLadder(16);
      expect(ladder).toEqual([
        { tier: EVoiceQualityTier.EXCELLENT, kbps: 16 },
        { tier: EVoiceQualityTier.GOOD, kbps: 10 },
        { tier: EVoiceQualityTier.BAD, kbps: 8 },
      ]);
    });

    it('builds ladder for base 12 kbps (collapsed to 2 tiers: 0, 3)', () => {
      const ladder = buildVoiceLadder(12);
      expect(ladder).toEqual([
        { tier: EVoiceQualityTier.EXCELLENT, kbps: 12 },
        { tier: EVoiceQualityTier.BAD, kbps: 8 },
      ]);
    });

    it('builds ladder for base 8 kbps (collapsed to 1 tier: 0)', () => {
      const ladder = buildVoiceLadder(8);
      expect(ladder).toEqual([{ tier: EVoiceQualityTier.EXCELLENT, kbps: 8 }]);
    });

    it('builds ladder for base 384 kbps', () => {
      const ladder = buildVoiceLadder(384);
      expect(ladder).toEqual([
        { tier: EVoiceQualityTier.EXCELLENT, kbps: 384 },
        { tier: EVoiceQualityTier.GOOD, kbps: 240 },
        { tier: EVoiceQualityTier.UNSTABLE, kbps: 144 },
        { tier: EVoiceQualityTier.BAD, kbps: 96 },
      ]);
    });
  });

  describe('evaluateVoiceQuality', () => {
    const ladder64 = buildVoiceLadder(64);

    const goodSample: TVoiceQualitySample = {
      score: 10,
      loss: 0,
      rttMs: 30,
      jitterMs: 5,
    };

    it('single-entry ladder (base 8) never changes level', () => {
      const ladder8 = buildVoiceLadder(8);
      let state = createInitialVoiceQualityState(
        EVoiceQualityTier.EXCELLENT,
        0,
      );

      const badSample: TVoiceQualitySample = {
        score: 1,
        loss: 30,
        rttMs: 800,
        jitterMs: 150,
      };

      state = evaluateVoiceQuality(ladder8, state, badSample, 2000);
      state = evaluateVoiceQuality(ladder8, state, badSample, 4000);

      expect(state.currentTier).toBe(EVoiceQualityTier.EXCELLENT);
    });

    it('stays at excellent when network is good', () => {
      let state = createInitialVoiceQualityState(
        EVoiceQualityTier.EXCELLENT,
        0,
      );

      state = evaluateVoiceQuality(ladder64, state, goodSample, 2000);
      expect(state.currentTier).toBe(EVoiceQualityTier.EXCELLENT);
      expect(state.consecutiveDownSamples).toBe(0);
      expect(state.consecutiveUpSamples).toBe(0);
    });

    describe('fast down logic', () => {
      it('does not drop tier after only 1 bad sample', () => {
        let state = createInitialVoiceQualityState(
          EVoiceQualityTier.EXCELLENT,
          0,
        );
        const badSample: TVoiceQualitySample = {
          score: 2,
          loss: 20,
          rttMs: 700,
          jitterMs: 90,
        };

        state = evaluateVoiceQuality(ladder64, state, badSample, 2000);
        expect(state.currentTier).toBe(EVoiceQualityTier.EXCELLENT);
        expect(state.consecutiveDownSamples).toBe(1);
        expect(state.pendingDowngradeTier).toBe(EVoiceQualityTier.BAD);
      });

      it('drops directly to tier 3 after 2 consecutive tier 3 samples', () => {
        let state = createInitialVoiceQualityState(
          EVoiceQualityTier.EXCELLENT,
          0,
        );
        const badSample: TVoiceQualitySample = {
          score: 2,
          loss: 20,
          rttMs: 700,
          jitterMs: 90,
        };

        state = evaluateVoiceQuality(ladder64, state, badSample, 2000);
        state = evaluateVoiceQuality(ladder64, state, badSample, 4000);

        expect(state.currentTier).toBe(EVoiceQualityTier.BAD);
        expect(state.consecutiveDownSamples).toBe(0);
        expect(state.pendingDowngradeTier).toBeNull();
        expect(state.lastChangeMs).toBe(4000);
      });

      it('drops to common worse tier when consecutive samples differ', () => {
        let state = createInitialVoiceQualityState(
          EVoiceQualityTier.EXCELLENT,
          0,
        );
        const unstableSample: TVoiceQualitySample = {
          score: 5,
          loss: 9,
          rttMs: 360,
          jitterMs: 85,
        };
        const badSample: TVoiceQualitySample = {
          score: 2,
          loss: 20,
          rttMs: 700,
          jitterMs: 90,
        };

        // Sample 1 triggers tier 2
        state = evaluateVoiceQuality(ladder64, state, unstableSample, 2000);
        expect(state.pendingDowngradeTier).toBe(EVoiceQualityTier.UNSTABLE);

        // Sample 2 triggers tier 3
        state = evaluateVoiceQuality(ladder64, state, badSample, 4000);
        // Common worse level is tier 2 (unstable)
        expect(state.currentTier).toBe(EVoiceQualityTier.UNSTABLE);
      });

      it('aborts down transition if next sample recovers', () => {
        let state = createInitialVoiceQualityState(
          EVoiceQualityTier.EXCELLENT,
          0,
        );
        const badSample: TVoiceQualitySample = {
          score: 2,
          loss: 20,
          rttMs: 700,
          jitterMs: 90,
        };

        state = evaluateVoiceQuality(ladder64, state, badSample, 2000);
        expect(state.consecutiveDownSamples).toBe(1);

        state = evaluateVoiceQuality(ladder64, state, goodSample, 4000);
        expect(state.consecutiveDownSamples).toBe(0);
        expect(state.pendingDowngradeTier).toBeNull();
        expect(state.currentTier).toBe(EVoiceQualityTier.EXCELLENT);
      });

      it.each([
        {
          name: 'score <= 7',
          sample: { score: 7, loss: 0, rttMs: 50, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.GOOD,
        },
        {
          name: 'loss >= 3',
          sample: { score: 10, loss: 3, rttMs: 50, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.GOOD,
        },
        {
          name: 'rtt >= 200',
          sample: { score: 10, loss: 0, rttMs: 200, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.GOOD,
        },
        {
          name: 'jitter >= 40',
          sample: { score: 10, loss: 0, rttMs: 50, jitterMs: 40 },
          expectedTier: EVoiceQualityTier.GOOD,
        },
        {
          name: 'score <= 5',
          sample: { score: 5, loss: 0, rttMs: 50, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.UNSTABLE,
        },
        {
          name: 'loss >= 8',
          sample: { score: 10, loss: 8, rttMs: 50, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.UNSTABLE,
        },
        {
          name: 'rtt >= 350',
          sample: { score: 10, loss: 0, rttMs: 350, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.UNSTABLE,
        },
        {
          name: 'jitter >= 80',
          sample: { score: 10, loss: 0, rttMs: 50, jitterMs: 80 },
          expectedTier: EVoiceQualityTier.UNSTABLE,
        },
        {
          name: 'score <= 3',
          sample: { score: 3, loss: 0, rttMs: 50, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.BAD,
        },
        {
          name: 'loss >= 15',
          sample: { score: 10, loss: 15, rttMs: 50, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.BAD,
        },
        {
          name: 'rtt >= 600',
          sample: { score: 10, loss: 0, rttMs: 600, jitterMs: 10 },
          expectedTier: EVoiceQualityTier.BAD,
        },
      ])(
        'triggers $expectedTier on boundary condition: $name',
        ({ sample, expectedTier }) => {
          let state = createInitialVoiceQualityState(
            EVoiceQualityTier.EXCELLENT,
            0,
          );
          state = evaluateVoiceQuality(ladder64, state, sample, 2000);
          state = evaluateVoiceQuality(ladder64, state, sample, 4000);
          expect(state.currentTier).toBe(expectedTier);
        },
      );
    });

    describe('slow up logic', () => {
      it('recovers stepwise from tier 3 with 8 samples + 10s dwell + margin', () => {
        let state = createInitialVoiceQualityState(EVoiceQualityTier.BAD, 0);

        // Feed 7 good samples (14s)
        for (let i = 1; i <= 7; i++) {
          state = evaluateVoiceQuality(ladder64, state, goodSample, i * 2000);
          expect(state.currentTier).toBe(EVoiceQualityTier.BAD);
          expect(state.consecutiveUpSamples).toBe(i);
        }

        // 8th good sample at 16s (nowMs = 16000, dwell = 16000 >= 10000)
        state = evaluateVoiceQuality(ladder64, state, goodSample, 16000);
        // Recovers one step: BAD (Tier 3) -> UNSTABLE (Tier 2)
        expect(state.currentTier).toBe(EVoiceQualityTier.UNSTABLE);
        expect(state.consecutiveUpSamples).toBe(0);
        expect(state.lastChangeMs).toBe(16000);

        // Feed another 8 good samples (from 18s to 32s)
        for (let i = 1; i <= 7; i++) {
          state = evaluateVoiceQuality(
            ladder64,
            state,
            goodSample,
            16000 + i * 2000,
          );
          expect(state.currentTier).toBe(EVoiceQualityTier.UNSTABLE);
          expect(state.consecutiveUpSamples).toBe(i);
        }
        state = evaluateVoiceQuality(ladder64, state, goodSample, 32000);
        // Recovers one step: UNSTABLE (Tier 2) -> GOOD (Tier 1)
        expect(state.currentTier).toBe(EVoiceQualityTier.GOOD);
        expect(state.lastChangeMs).toBe(32000);
      });

      it('does not upgrade if dwell time < 10s even with 8 samples', () => {
        // Last change happened at 5000ms
        let state = createInitialVoiceQualityState(
          EVoiceQualityTier.GOOD,
          5000,
        );
        state.consecutiveUpSamples = 7;

        // Now is 11000ms (dwell is only 6000ms < 10000ms)
        state = evaluateVoiceQuality(ladder64, state, goodSample, 11000);
        expect(state.currentTier).toBe(EVoiceQualityTier.GOOD);
        expect(state.consecutiveUpSamples).toBe(8);

        // When dwell reaches >= 10s (e.g. 15000ms), 9th sample triggers upgrade
        state = evaluateVoiceQuality(ladder64, state, goodSample, 15000);
        expect(state.currentTier).toBe(EVoiceQualityTier.EXCELLENT);
      });

      it('does not upgrade if sample does not meet current tier margin', () => {
        // Current tier: GOOD (thresholds: score <= 7, loss >= 3, rtt >= 200, jitter >= 40)
        // Margin for Tier 1: score >= 9, loss < 1.5, rtt < 160, jitter < 32
        let state = createInitialVoiceQualityState(EVoiceQualityTier.GOOD, 0);

        // Sample has loss = 2.0% (better than 3%, but not below margin 1.5%)
        const belowMarginSample: TVoiceQualitySample = {
          score: 9,
          loss: 2.0,
          rttMs: 50,
          jitterMs: 10,
        };

        state = evaluateVoiceQuality(ladder64, state, belowMarginSample, 2000);
        expect(state.currentTier).toBe(EVoiceQualityTier.GOOD);
        expect(state.consecutiveUpSamples).toBe(0);
      });

      it('stepwise recovery on collapsed ladder (base 16: tiers 0, 1, 3)', () => {
        const ladder16 = buildVoiceLadder(16);
        let state = createInitialVoiceQualityState(EVoiceQualityTier.BAD, 0);

        // 8 good samples -> steps to Tier 1
        for (let i = 1; i <= 8; i++) {
          state = evaluateVoiceQuality(ladder16, state, goodSample, i * 2000);
        }
        expect(state.currentTier).toBe(EVoiceQualityTier.GOOD);

        // Another 8 good samples -> steps to Tier 0
        for (let i = 1; i <= 8; i++) {
          state = evaluateVoiceQuality(
            ladder16,
            state,
            goodSample,
            16000 + i * 2000,
          );
        }
        expect(state.currentTier).toBe(EVoiceQualityTier.EXCELLENT);
      });
    });

    describe('null & missing information handling', () => {
      it('all null samples maintain current tier and never increment up count', () => {
        let state = createInitialVoiceQualityState(
          EVoiceQualityTier.UNSTABLE,
          0,
        );
        const nullSample: TVoiceQualitySample = {
          score: null,
          loss: null,
          rttMs: null,
          jitterMs: null,
        };

        for (let i = 1; i <= 10; i++) {
          state = evaluateVoiceQuality(ladder64, state, nullSample, i * 2000);
          expect(state.currentTier).toBe(EVoiceQualityTier.UNSTABLE);
          expect(state.consecutiveUpSamples).toBe(0);
          expect(state.consecutiveDownSamples).toBe(0);
        }
      });

      it('missing score never raises level', () => {
        let state = createInitialVoiceQualityState(EVoiceQualityTier.GOOD, 0);
        const sampleNoScore: TVoiceQualitySample = {
          score: null,
          loss: 0,
          rttMs: 20,
          jitterMs: 5,
        };

        state = evaluateVoiceQuality(ladder64, state, sampleNoScore, 2000);
        expect(state.consecutiveUpSamples).toBe(0);
      });

      it('missing loss never raises level', () => {
        let state = createInitialVoiceQualityState(EVoiceQualityTier.GOOD, 0);
        const sampleNoLoss: TVoiceQualitySample = {
          score: 10,
          loss: null,
          rttMs: 20,
          jitterMs: 5,
        };

        state = evaluateVoiceQuality(ladder64, state, sampleNoLoss, 2000);
        expect(state.consecutiveUpSamples).toBe(0);
      });
    });
  });
});
