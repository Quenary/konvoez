import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { IRoom, IRoomCreate, IRoomUpdate } from './rooms.interface';
import { HttpErrorResponse } from '@angular/common/http';

export const RoomsActions = createActionGroup({
  source: 'ROOMS',
  events: {
    selectRoom: props<{ room: IRoom | null }>(),
    requestRooms: emptyProps(),
    requestRoomsSuccess: props<{ rooms: IRoom[] }>(),
    requestRoomsError: props<{ error: HttpErrorResponse }>(),
    requestRoom: props<{ id: number }>(),
    requestRoomSuccess: props<{ room: IRoom }>(),
    requestRoomError: props<{ error: HttpErrorResponse }>(),
    requestCreateRoom: props<{ room: IRoomCreate }>(),
    requestCreateRoomSuccess: props<{ room: IRoom }>(),
    requestCreateRoomError: props<{ error: HttpErrorResponse }>(),
    requestUpdateRoom: props<{ id: number; room: IRoomUpdate }>(),
    requestUpdateRoomSuccess: props<{ room: IRoom }>(),
    requestUpdateRoomError: props<{ error: HttpErrorResponse }>(),
    requestDeleteRoom: props<{ id: number }>(),
    requestDeleteRoomSuccess: props<{ id: number }>(),
    requestDeleteRoomError: props<{ error: HttpErrorResponse }>(),
  },
});
