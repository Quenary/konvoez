import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { finalize } from 'rxjs';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';

/**
 * Keeps the text-room socket connected for the app lifetime (unread, DM list,
 * open chat). Must stay root — ChatStore is component-scoped.
 */
@Injectable({ providedIn: 'root' })
export class TextRoomSocketConnectionService {
  private readonly socket = inject(TextRoomSocketToken);
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.store
      .select(selectIsAuthorized)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.socket.disconnect()),
      )
      .subscribe((isAuthorized) => {
        if (isAuthorized) {
          this.socket.connect();
        } else {
          this.socket.disconnect();
        }
      });
  }
}
