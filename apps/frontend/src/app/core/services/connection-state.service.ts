import { Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, map, merge } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConnectionStateService {
  private readonly _isOnline = signal<boolean>(navigator.onLine);
  public readonly isOnline = this._isOnline.asReadonly();

  constructor() {
    merge(fromEvent(window, 'online'), fromEvent(window, 'offline'))
      .pipe(
        map((event) => event.type === 'online'),
        takeUntilDestroyed(),
      )
      .subscribe((isOnline) => {
        this._isOnline.set(isOnline);
      });
  }
}
