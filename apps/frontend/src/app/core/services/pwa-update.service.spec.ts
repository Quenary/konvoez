import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdateService } from './pwa-update.service';

describe('PwaUpdateService', () => {
  let versionUpdates$: Subject<VersionEvent>;
  let dialogService: { open: ReturnType<typeof vi.fn> };
  let swUpdate: {
    isEnabled: boolean;
    versionUpdates: ReturnType<Subject<VersionEvent>['asObservable']>;
  };

  beforeEach(() => {
    versionUpdates$ = new Subject<VersionEvent>();
    dialogService = {
      open: vi.fn(() => of(false)),
    };
    swUpdate = {
      isEnabled: true,
      versionUpdates: versionUpdates$.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: SwUpdate, useValue: swUpdate },
        { provide: TuiResponsiveDialogService, useValue: dialogService },
      ],
    });
  });

  afterEach(() => {
    versionUpdates$.complete();
    TestBed.resetTestingModule();
  });

  it('should not subscribe when service worker is disabled', async () => {
    swUpdate.isEnabled = false;

    TestBed.inject(PwaUpdateService);

    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it('should open dialog after a one-second delay when a new version is ready', async () => {
    TestBed.inject(PwaUpdateService);

    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });

    expect(dialogService.open).not.toHaveBeenCalled();

    await vi.waitFor(
      () => {
        expect(dialogService.open).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  it('should ignore non-ready version events', async () => {
    TestBed.inject(PwaUpdateService);

    versionUpdates$.next({
      type: 'VERSION_DETECTED',
      version: { hash: 'b' },
    });
    versionUpdates$.next({
      type: 'NO_NEW_VERSION_DETECTED',
      version: { hash: 'a' },
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it('should reload the page when the user confirms the update', async () => {
    dialogService.open.mockReturnValue(of(true));

    const service = TestBed.inject(PwaUpdateService);
    const applyAvailableUpdate = vi.fn(() => undefined);
    service['applyAvailableUpdate'] = applyAvailableUpdate;

    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });

    await vi.waitFor(
      () => {
        expect(applyAvailableUpdate).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  it('should not reload when the dialog is dismissed', async () => {
    dialogService.open.mockReturnValue(of(false));

    const service = TestBed.inject(PwaUpdateService);
    const applyAvailableUpdate = vi.fn(() => undefined);
    service['applyAvailableUpdate'] = applyAvailableUpdate;

    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });

    await vi.waitFor(
      () => {
        expect(dialogService.open).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    expect(applyAvailableUpdate).not.toHaveBeenCalled();
  });
});
