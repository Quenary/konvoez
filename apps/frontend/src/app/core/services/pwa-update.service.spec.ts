import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { EVoiceSessionType } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdateService } from './pwa-update.service';

describe('PwaUpdateService', () => {
  let versionUpdates$: Subject<VersionEvent>;
  let isStable$: Subject<boolean>;
  let dialogService: { open: ReturnType<typeof vi.fn> };
  let swUpdate: {
    isEnabled: boolean;
    versionUpdates: ReturnType<Subject<VersionEvent>['asObservable']>;
    unrecoverable: Subject<void>;
    checkForUpdate: ReturnType<typeof vi.fn>;
  };
  let activeSession: ReturnType<typeof signal<unknown>>;
  let joiningTarget: ReturnType<typeof signal<unknown>>;

  beforeEach(() => {
    versionUpdates$ = new Subject<VersionEvent>();
    isStable$ = new Subject<boolean>();
    dialogService = {
      open: vi.fn(() => of(false)),
    };
    swUpdate = {
      isEnabled: true,
      versionUpdates: versionUpdates$.asObservable(),
      unrecoverable: new Subject<void>(),
      checkForUpdate: vi.fn().mockResolvedValue(true),
    };
    activeSession = signal(null);
    joiningTarget = signal(null);

    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: SwUpdate, useValue: swUpdate },
        { provide: TuiResponsiveDialogService, useValue: dialogService },
        {
          provide: VoiceSessionStore,
          useValue: {
            activeSession: activeSession.asReadonly(),
            joiningTarget: joiningTarget.asReadonly(),
          },
        },
      ],
    });

    const appRef = TestBed.inject(ApplicationRef);
    Object.defineProperty(appRef, 'isStable', {
      value: isStable$.asObservable(),
      configurable: true,
    });
  });

  afterEach(() => {
    versionUpdates$.complete();
    isStable$.complete();
    swUpdate.unrecoverable.complete();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('reloads immediately on confirmed update even if a voice session is active', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    activeSession.set({ type: EVoiceSessionType.GROUP_ROOM, roomId: 1 });

    const service = TestBed.inject(PwaUpdateService);
    service.applyAvailableUpdate();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads immediately on confirmed update even if a voice join is in progress', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    joiningTarget.set({ type: EVoiceSessionType.GROUP_ROOM, roomId: 2 });

    const service = TestBed.inject(PwaUpdateService);
    service.applyAvailableUpdate();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('defers unrecoverable reload dialog while a voice session is active', async () => {
    activeSession.set({ type: EVoiceSessionType.GROUP_ROOM, roomId: 1 });
    TestBed.inject(PwaUpdateService);

    swUpdate.unrecoverable.next();

    expect(dialogService.open).not.toHaveBeenCalled();

    activeSession.set(null);
    await vi.waitFor(() => {
      expect(dialogService.open).toHaveBeenCalled();
    });
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
    service.applyAvailableUpdate = applyAvailableUpdate;

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

  it('sets updatePostponed to true and does not reload when update is postponed', async () => {
    dialogService.open.mockReturnValue(of(false));

    const service = TestBed.inject(PwaUpdateService);
    const applyAvailableUpdate = vi.fn(() => undefined);
    service.applyAvailableUpdate = applyAvailableUpdate;

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

    expect(service.updatePostponed()).toBe(true);
    expect(service.postponedUpdateType()).toBe('update');
    expect(applyAvailableUpdate).not.toHaveBeenCalled();
  });

  it('sets postponedUpdateType to unrecoverable when unrecoverable dialog is postponed', async () => {
    dialogService.open.mockReturnValue(of(false));

    const service = TestBed.inject(PwaUpdateService);
    const applyAvailableUpdate = vi.fn(() => undefined);
    service.applyAvailableUpdate = applyAvailableUpdate;

    swUpdate.unrecoverable.next();

    await vi.waitFor(
      () => {
        expect(dialogService.open).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    expect(service.updatePostponed()).toBe(true);
    expect(service.postponedUpdateType()).toBe('unrecoverable');
    expect(applyAvailableUpdate).not.toHaveBeenCalled();
  });

  it('does not reopen update dialog if update was already postponed', async () => {
    vi.useFakeTimers();
    const service = TestBed.inject(PwaUpdateService);
    service['_postponedUpdate'].set('update');

    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });

    await vi.advanceTimersByTimeAsync(1100);

    expect(dialogService.open).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('resets dialogOpen flag via finalize when dialog errors', async () => {
    dialogService.open.mockReturnValue(
      throwError(() => new Error('dialog error')),
    );
    const service = TestBed.inject(PwaUpdateService);

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

    expect(service['dialogOpen']).toBe(false);
  });

  it('does not check for update on visibilitychange before isStable', async () => {
    TestBed.inject(PwaUpdateService);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('does not check for update on visibilitychange within 5 minutes of startup', async () => {
    TestBed.inject(PwaUpdateService);

    isStable$.next(true);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('checks for update on visibilitychange when tab becomes visible after isStable and 5 minutes elapsed', async () => {
    vi.useFakeTimers();
    TestBed.inject(PwaUpdateService);

    isStable$.next(true);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(0);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does not check for update on visibilitychange when tab is hidden', async () => {
    vi.useFakeTimers();
    TestBed.inject(PwaUpdateService);

    isStable$.next(true);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    swUpdate.checkForUpdate.mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(0);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('throttles checkForUpdate calls so it cannot be invoked more often than once every 5 minutes', async () => {
    vi.useFakeTimers();
    TestBed.inject(PwaUpdateService);

    isStable$.next(true);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    // Startup check was automatic, so initial visibilitychange within 5 min is throttled
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();

    // After 5 minutes elapse from startup, visibilitychange triggers a check
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    // Rapid switches within 5 minutes
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    // After 5 minutes elapse, next visibilitychange triggers a check
    await vi.advanceTimersByTimeAsync(50_000); // 300,000 ms total elapsed
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('checks for update periodically after isStable', async () => {
    vi.useFakeTimers();
    TestBed.inject(PwaUpdateService);

    isStable$.next(true);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('returns cached lastCheckResult when checkForUpdate is throttled within 5 minutes', async () => {
    vi.useFakeTimers();
    swUpdate.checkForUpdate.mockResolvedValue(true);
    const service = TestBed.inject(PwaUpdateService);

    // Initially throttled due to startup check
    const initialResult = await service['checkForUpdate']();
    expect(initialResult).toBe(false);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();

    // Advance past startup window
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    const result1 = await service['checkForUpdate']();
    expect(result1).toBe(true);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    const result2 = await service['checkForUpdate']();
    expect(result2).toBe(true);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
