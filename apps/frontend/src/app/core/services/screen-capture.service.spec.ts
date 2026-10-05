import { describe, expect, it } from 'vitest';
import { ScreenCaptureService } from './screen-capture.service';

describe('ScreenCaptureService', () => {
  it('reports support from mediaDevices.getDisplayMedia', () => {
    expect(typeof ScreenCaptureService.isSupported()).toBe('boolean');
  });
});
