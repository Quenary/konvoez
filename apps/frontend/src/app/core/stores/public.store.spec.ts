import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublicApiService } from '@core/services/public-api.service';
import { DEFAULT_PUBLIC_SETTINGS, PublicStore } from './public.store';
import { IPublicSettings } from '@konvoez/shared';

describe('PublicStore', () => {
  let store: InstanceType<typeof PublicStore>;
  let mockPublicApiService: {
    getSettings: ReturnType<typeof vi.fn>;
  };

  const mockSettings: IPublicSettings = {
    isOwnerSetupRequired: false,
    inviteOnlySignUp: true,
    smtpConfigured: true,
  };

  beforeEach(() => {
    mockPublicApiService = {
      getSettings: vi.fn().mockReturnValue(of(mockSettings)),
    };

    TestBed.configureTestingModule({
      providers: [
        PublicStore,
        {
          provide: PublicApiService,
          useValue: mockPublicApiService,
        },
      ],
    });

    store = TestBed.inject(PublicStore);
  });

  it('loads public settings on creation and exposes computed signals', () => {
    TestBed.flushEffects();

    expect(mockPublicApiService.getSettings).toHaveBeenCalled();
    expect(store.publicSettings.value()).toEqual(mockSettings);
    expect(store.settings()).toEqual(mockSettings);
    expect(store.isSmtpConfigured()).toBe(true);
    expect(store.inviteOnlySignUp()).toBe(true);
    expect(store.isOwnerSetupRequired()).toBe(false);
  });

  it('reloads settings when reload is called', () => {
    TestBed.flushEffects();
    expect(mockPublicApiService.getSettings).toHaveBeenCalledTimes(1);

    const updatedSettings: IPublicSettings = {
      ...mockSettings,
      smtpConfigured: false,
    };
    mockPublicApiService.getSettings.mockReturnValue(of(updatedSettings));

    store.reload();
    TestBed.flushEffects();

    expect(mockPublicApiService.getSettings).toHaveBeenCalledTimes(2);
    expect(store.isSmtpConfigured()).toBe(false);
  });

  it('falls back to DEFAULT_PUBLIC_SETTINGS on error', () => {
    mockPublicApiService.getSettings.mockReturnValue(
      throwError(() => new Error('Network error')),
    );

    store.reload();
    TestBed.flushEffects();

    expect(store.publicSettings.value()).toEqual(DEFAULT_PUBLIC_SETTINGS);
    expect(store.isSmtpConfigured()).toBe(false);
  });
});
