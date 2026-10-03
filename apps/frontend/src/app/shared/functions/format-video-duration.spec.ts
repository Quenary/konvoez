import { describe, expect, it } from 'vitest';
import { formatVideoDuration } from './format-video-duration';

describe('formatVideoDuration', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatVideoDuration(5_000)).toBe('0:05');
    expect(formatVideoDuration(83_000)).toBe('1:23');
    expect(formatVideoDuration(3_600_000)).toBe('1:00:00');
  });
});
