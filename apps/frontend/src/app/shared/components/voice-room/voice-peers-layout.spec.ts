import { describe, expect, it } from 'vitest';
import {
  preferTheatreStripRight,
  voiceSectionGridClass,
} from './voice-peers-layout';

describe('voiceSectionGridClass', () => {
  it('maps counts to section classes', () => {
    expect(voiceSectionGridClass(1)).toBe('section-1');
    expect(voiceSectionGridClass(2)).toBe('section-2');
    expect(voiceSectionGridClass(3)).toBe('section-4');
    expect(voiceSectionGridClass(5)).toBe('section-many');
  });
});

describe('preferTheatreStripRight', () => {
  it('uses bottom strip for typical 16:9 in near-16:9 container', () => {
    expect(preferTheatreStripRight(1280, 720, 1920, 1080)).toBe(false);
  });

  it('uses right strip for ultrawide container vs 16:9 stream', () => {
    expect(preferTheatreStripRight(2560, 720, 1920, 1080)).toBe(true);
  });
});
