import { TextRoomCommon } from '@konvoez/shared';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { TextRoomActions } from './text-room.actions';

export enum EMessageStatus {
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

/**
 * Frontend message entity
 */
export interface IMessageEntity extends TextRoomCommon.IMessage {
  status: EMessageStatus;
}

export interface ITextRoomState extends EntityState<IMessageEntity> {
  selectedRoomId: number | null;
  selectedRecipientId: number | null;
  editableMessageId: string | null;
}

export const textRoomAdapter = createEntityAdapter<IMessageEntity>({
  selectId: (m) => m.id,
  // Sorted ASC (from oldest to newest)
  sortComparer: (a, b) => a.createdAt.valueOf() - b.createdAt.valueOf(),
});

export const textRoomInitialState =
  textRoomAdapter.getInitialState<ITextRoomState>({
    selectedRoomId: null,
    selectedRecipientId: null,
    editableMessageId: null,
  });

export const textRoomReducer = createReducer<ITextRoomState>(
  textRoomInitialState,
  on(TextRoomActions.join, (_, payload) => ({
    ...textRoomInitialState,
    selectedRoomId: payload.roomId,
    selectedRecipientId: payload.recipientId,
  })),
  on(TextRoomActions.leave, () =>
    textRoomAdapter.removeAll({
      ...textRoomInitialState,
      selectedRoomId: null,
      selectedRecipientId: null,
    }),
  ),
  on(TextRoomActions.requestListSuccess, (state, payload) => {
    const { items } = payload.data;
    return textRoomAdapter.upsertMany(
      items.map((item) => ({
        ...item,
        status: EMessageStatus.SUCCESS,
      })),
      state,
    );
  }),
  // Create
  on(TextRoomActions.createMessage, (state, payload) =>
    textRoomAdapter.addOne(
      {
        ...payload.data,
        id: payload.tempId,
        senderId: null as any,
        senderUsername: null as any,
        createdAt: new Date(),
        updatedAt: null,
        status: EMessageStatus.LOADING,
      },
      state,
    ),
  ),
  on(TextRoomActions.createMessageSuccess, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.tempId,
        changes: {
          ...payload.data,
          status: EMessageStatus.SUCCESS,
        },
      },
      state,
    ),
  ),
  on(TextRoomActions.createMessageError, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.tempId,
        changes: {
          status: EMessageStatus.ERROR,
        },
      },
      state,
    ),
  ),
  // Update
  on(TextRoomActions.setEditableMessageId, (state, payload) => ({
    ...state,
    editableMessageId: payload.id,
  })),
  on(TextRoomActions.updateMessage, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.messageId,
        changes: {
          status: EMessageStatus.LOADING,
        },
      },
      state,
    ),
  ),
  on(TextRoomActions.updateMessageSuccess, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.data.id,
        changes: {
          ...payload.data,
          status: EMessageStatus.SUCCESS,
        },
      },
      {
        ...state,
        editableMessageId: null,
      },
    ),
  ),
  on(TextRoomActions.updateMessageError, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.messageId,
        changes: {
          status: EMessageStatus.ERROR,
        },
      },
      state,
    ),
  ),
  // Delete
  on(TextRoomActions.deleteMessage, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.messageId,
        changes: {
          status: EMessageStatus.LOADING,
        },
      },
      state,
    ),
  ),
  on(TextRoomActions.deleteMessageSuccess, (state, payload) =>
    textRoomAdapter.removeOne(payload.messageId, state),
  ),
  on(TextRoomActions.deleteMessageError, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.messageId,
        changes: {
          status: EMessageStatus.ERROR,
        },
      },
      state,
    ),
  ),
);
