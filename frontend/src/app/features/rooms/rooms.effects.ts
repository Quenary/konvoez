import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { RoomsActions } from './rooms.actions';
import { catchError, map, of, switchMap } from 'rxjs';
import { RoomsApiService } from './rooms-api.service';

@Injectable()
export class RoomsEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly roomsApiService = inject(RoomsApiService);

  readonly requestRooms$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomsActions.requestRooms),
      switchMap(() =>
        this.roomsApiService.list().pipe(
          map((rooms) => RoomsActions.requestRoomsSuccess({ rooms })),
          catchError((error) => of(RoomsActions.requestRoomsError({ error }))),
        ),
      ),
    ),
  );
}
