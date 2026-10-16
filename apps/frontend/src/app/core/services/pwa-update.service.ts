import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { TranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TUI_CONFIRM, type TuiConfirmData } from '@taiga-ui/kit';
import {
  catchError,
  delay,
  EMPTY,
  exhaustMap,
  filter,
  finalize,
  fromEvent,
  interval,
  merge,
  switchMap,
  take,
} from 'rxjs';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export type PwaPostponedUpdate = 'update' | 'unrecoverable';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly translateService = inject(TranslateService);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly applicationRef = inject(ApplicationRef);
  private readonly document = inject(DOCUMENT);

  private readonly _postponedUpdate = signal<PwaPostponedUpdate | null>(null);
  readonly updatePostponed = computed(() => this._postponedUpdate() !== null);
  readonly postponedUpdateType = this._postponedUpdate.asReadonly();

  private dialogOpen = false;
  private pendingUnrecoverableReload = false;
  private lastCheckTime = Date.now();
  private lastCheckResult = false;

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.handleUnrecoverableUpdate();
      });

    this.swUpdate.versionUpdates
      .pipe(
        filter(
          (event): event is VersionReadyEvent => event.type === 'VERSION_READY',
        ),
        delay(1000),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (!this.updatePostponed()) {
          this.openUpdateDialog();
        }
      });

    const isStable$ = this.applicationRef.isStable.pipe(
      filter((isStable) => isStable),
      take(1),
    );

    const periodicCheck$ = interval(CHECK_INTERVAL_MS);

    const visibilityCheck$ = fromEvent(this.document, 'visibilitychange').pipe(
      filter(() => this.document.visibilityState === 'visible'),
    );

    isStable$
      .pipe(
        switchMap(() => merge(periodicCheck$, visibilityCheck$)),
        exhaustMap(() => this.checkForUpdate()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    effect(() => {
      const session = this.voiceSessionStore.activeSession();
      const joining = this.voiceSessionStore.joiningTarget();
      if (session !== null || joining !== null) {
        return;
      }
      if (this.pendingUnrecoverableReload) {
        this.pendingUnrecoverableReload = false;
        this.openUnrecoverableDialog();
      }
    });
  }

  applyAvailableUpdate(): void {
    location.reload();
  }

  private async checkForUpdate(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastCheckTime < MIN_CHECK_INTERVAL_MS) {
      return this.lastCheckResult;
    }
    this.lastCheckTime = now;
    try {
      this.lastCheckResult = await this.swUpdate.checkForUpdate();
      return this.lastCheckResult;
    } catch {
      this.lastCheckResult = false;
      return false;
    }
  }

  private handleUnrecoverableUpdate(): void {
    if (
      this.voiceSessionStore.activeSession() ||
      this.voiceSessionStore.joiningTarget()
    ) {
      this.pendingUnrecoverableReload = true;
      return;
    }
    this.openUnrecoverableDialog();
  }

  private openUnrecoverableDialog(): void {
    if (this.dialogOpen) {
      return;
    }
    this.dialogOpen = true;

    this.tuiResponsiveDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant('PWA.UNRECOVERABLE.TITLE'),
        size: 's',
        closable: false,
        dismissible: false,
        required: true,
        data: {
          content: this.translateService.instant('PWA.UNRECOVERABLE.CONTENT'),
          yes: this.translateService.instant('PWA.UNRECOVERABLE.ACTION'),
          no: this.translateService.instant('GENERAL.LATER'),
        } satisfies TuiConfirmData,
      })
      .pipe(
        take(1),
        catchError(() => EMPTY),
        finalize(() => {
          this.dialogOpen = false;
        }),
      )
      .subscribe((shouldReload) => {
        if (shouldReload) {
          this.applyAvailableUpdate();
        } else {
          this._postponedUpdate.set('unrecoverable');
        }
      });
  }

  private openUpdateDialog(): void {
    if (this.dialogOpen) {
      return;
    }

    this.dialogOpen = true;

    this.tuiResponsiveDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant('PWA.UPDATE.TITLE'),
        size: 's',
        closable: false,
        dismissible: false,
        required: true,
        data: {
          content: this.translateService.instant('PWA.UPDATE.CONTENT'),
          yes: this.translateService.instant('PWA.UPDATE.ACTION'),
          no: this.translateService.instant('GENERAL.LATER'),
        } satisfies TuiConfirmData,
      })
      .pipe(
        take(1),
        catchError(() => EMPTY),
        finalize(() => {
          this.dialogOpen = false;
        }),
      )
      .subscribe((shouldUpdate) => {
        if (shouldUpdate) {
          this.applyAvailableUpdate();
        } else {
          this._postponedUpdate.set('update');
        }
      });
  }
}
