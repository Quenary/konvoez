import { HttpErrorResponse } from '@angular/common/http';
import {
  ITextRoomCreateMessage,
  ITextRoomEditMessage,
  ITextRoomListRequest,
  ITextRoomListResponse,
  ITextRoomMessage,
  ITextRoomUserTyping,
} from '@konvoez/shared';
import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const TextRoomActions = createActionGroup({
  source: 'TEXT_ROOM',
  events: {
    join: props<{ roomId: number | null; recipientId: number | null }>(),
    leave: emptyProps(),
    // list
    requestNextPage: emptyProps(),
    requestPrevPage: emptyProps(),
    requestList: props<{ data: ITextRoomListRequest }>(),
    requestListSuccess: props<{
      data: ITextRoomListResponse;
    }>(),
    requestListError: props<{ error: HttpErrorResponse }>(),
    // Create
    createMessage: props<{
      tempId: string;
      data: ITextRoomCreateMessage;
    }>(),
    createMessageSuccess: props<{
      tempId: string;
      data: ITextRoomMessage;
    }>(),
    createMessageError: props<{ tempId: string; error: HttpErrorResponse }>(),
    // Update
    setEditableMessageId: props<{ id: string | null }>(),
    updateMessage: props<{
      messageId: string;
      data: ITextRoomEditMessage;
    }>(),
    updateMessageSuccess: props<{ data: ITextRoomMessage }>(),
    updateMessageError: props<{
      messageId: string;
      error: HttpErrorResponse;
    }>(),
    // Delete
    deleteMessage: props<{ messageId: string }>(),
    deleteMessageSuccess: props<{ messageId: string }>(),
    deleteMessageError: props<{
      messageId: string;
      error: HttpErrorResponse;
    }>(),
    // Typing
    userTyping: props<{ data: ITextRoomUserTyping }>(),
    sendUserTyping: emptyProps(),
  },
});
