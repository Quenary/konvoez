import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '@core/api/auth-api.service';
import { AuthActions } from './auth.actions';
import { selectIsAuthorized } from './auth.selectors';

@Injectable({ providedIn: 'root' })
export class TokenRefreshService {
  private readonly authApiService = inject(AuthApiService);
  private readonly store = inject(Store);
  private readonly isAuthorized = this.store.selectSignal(selectIsAuthorized);

  private inflight: Promise<boolean> | null = null;

  refresh(): Promise<boolean> {
    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = firstValueFrom(this.authApiService.refresh())
      .then(
        () => true,
        () => {
          if (this.isAuthorized()) {
            this.store.dispatch(AuthActions.sessionExpired());
          }
          return false;
        },
      )
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }
}
