import { HttpErrorResponse } from '@angular/common/http';
import { Paged } from '@common/paged';
import { TextRoomCommon } from '@common/text-room';
import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const TextRoomActions = createActionGroup({
  source: 'TEXT_ROOM',
  events: {
    join: props<{ roomId: number | null; recipientId: number | null }>(),
    leave: emptyProps(),
    // list
    requestNextPage: emptyProps(),
    requestPrevPage: emptyProps(),
    requestList: props<{ data: TextRoomCommon.IListRequest }>(),
    requestListSuccess: props<{
      data: Paged.IResponse<TextRoomCommon.IMessage>;
      req: TextRoomCommon.IListRequest;
    }>(),
    requestListError: props<{ error: HttpErrorResponse }>(),
    // Create
    createMessage: props<{
      tempId: string;
      data: TextRoomCommon.ICreateMessage;
    }>(),
    createMessageSuccess: props<{
      tempId: string;
      data: TextRoomCommon.IMessage;
    }>(),
    createMessageError: props<{ tempId: string; error: HttpErrorResponse }>(),
    // Edit
    editMessage: props<{
      messageId: string;
      data: TextRoomCommon.IEditMessage;
    }>(),
    editMessageSuccess: props<{ data: TextRoomCommon.IMessage }>(),
    editMessageError: props<{ messageId: string; error: HttpErrorResponse }>(),
    // Delete
    deleteMessage: props<{ messageId: string }>(),
    deleteMessageSuccess: props<{ messageId: string }>(),
    deleteMessageError: props<{
      messageId: string;
      error: HttpErrorResponse;
    }>(),
    // Typing
    userTyping: props<{ data: TextRoomCommon.IUserTyping }>(),
    sendUserTyping: emptyProps(),
  },
});
