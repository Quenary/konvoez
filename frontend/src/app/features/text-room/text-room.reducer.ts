import { TextRoomCommon } from '@common/text-room';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { TextRoomActions } from './text-room.actions';

// Отрефакторить на start/end вместо страниц

export enum EMessageStatus {
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface IMessageWithStatus extends TextRoomCommon.IMessage {
  status: EMessageStatus;
}

export interface ITextRoomState extends EntityState<IMessageWithStatus> {
  selectedRoomId: number | null;
  selectedRecipientId: number | null;
  avatars: Record<number, string>;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export const textRoomAdapter = createEntityAdapter<IMessageWithStatus>({
  selectId: (m) => m.id,
  // Sorted ASC (from oldest to newest)
  sortComparer: (a, b) => a.createdAt.valueOf() - b.createdAt.valueOf(),
});

export const textRoomInitialState =
  textRoomAdapter.getInitialState<ITextRoomState>({
    selectedRoomId: null,
    selectedRecipientId: null,
    avatars: {},
    hasMoreAfter: true,
    hasMoreBefore: true,
  });

export const textRoomReducer = createReducer<ITextRoomState>(
  textRoomInitialState,
  on(TextRoomActions.join, (state, payload) => ({
    ...textRoomInitialState,
    selectedRoomId: payload.roomId,
    selectedRecipientId: payload.recipientId,
  })),
  on(TextRoomActions.leave, (state, payload) =>
    textRoomAdapter.removeAll({
      ...textRoomInitialState,
      selectedRoomId: null,
      selectedRecipientId: null,
    }),
  ),
  on(TextRoomActions.requestListSuccess, (state, payload) => {
    const { items, hasMoreAfter, hasMoreBefore } = payload.data;
    return (state = textRoomAdapter.upsertMany(
      items.map((item) => ({
        ...item,
        status: EMessageStatus.SUCCESS,
      })),
      {
        ...state,
        hasMoreAfter,
        hasMoreBefore,
      },
    ));
  }),
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
  on(TextRoomActions.editMessage, (state, payload) =>
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
  on(TextRoomActions.editMessageSuccess, (state, payload) =>
    textRoomAdapter.updateOne(
      {
        id: payload.data.id,
        changes: {
          ...payload.data,
          status: EMessageStatus.SUCCESS,
        },
      },
      state,
    ),
  ),
  on(TextRoomActions.editMessageError, (state, payload) =>
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
  on(TextRoomActions.requestAvatarSuccess, (state, payload) => ({
    ...state,
    avatars: {
      ...state.avatars,
      [payload.userId]: payload.avatar,
    },
  })),
);
