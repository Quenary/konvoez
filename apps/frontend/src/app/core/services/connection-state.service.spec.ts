/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionStateService } from './connection-state.service';

describe('ConnectionStateService', () => {
  let service: ConnectionStateService;

  beforeEach(() => {
    vi.stubGlobal('navigator', { ...navigator, onLine: true });

    TestBed.configureTestingModule({});
    service = TestBed.inject(ConnectionStateService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('reflects navigator.onLine on init', () => {
    expect(service.isOnline()).toBe(true);

    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const offlineOnInit = TestBed.inject(ConnectionStateService);
    expect(offlineOnInit.isOnline()).toBe(false);
  });

  it('updates isOnline when the browser goes offline', () => {
    window.dispatchEvent(new Event('offline'));
    expect(service.isOnline()).toBe(false);
  });

  it('updates isOnline when the browser goes back online', () => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(service.isOnline()).toBe(true);
  });
});
