import { TextRoomCommon } from '@common/text-room';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { TextRoomActions } from './text-room.actions';

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
  totalElements: number | null;
  totalPages: number | null;
  loadedPages: number[];
  // centerPage: number | null;
  currentPage: number | null;
}

export const textRoomAdapter = createEntityAdapter<IMessageWithStatus>({
  selectId: (m) => m.id,
  sortComparer: (a, b) =>
    new Date(a.createdAt) > new Date(b.createdAt) ? 1 : -1,
});

export const textRoomInitialState =
  textRoomAdapter.getInitialState<ITextRoomState>({
    selectedRoomId: null,
    selectedRecipientId: null,
    totalElements: null,
    totalPages: null,
    loadedPages: [],
    // centerPage: null,
    currentPage: null,
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
    const { pageNumber, pageSize } = payload.req;
    const { totalElements, totalPages, items } = payload.data;

    return (state = textRoomAdapter.upsertMany(
      items.map((item) => ({
        ...item,
        status: EMessageStatus.SUCCESS,
      })),
      {
        ...state,
        totalElements,
        totalPages,
        currentPage: pageNumber,
        loadedPages: [...new Set([...state.loadedPages, pageNumber])],
      },
    ));
    // state = {
    //   ...state,
    //   totalElements,
    //   totalPages,
    //   currentPage: pageNumber,
    //   loadedPages: [...new Set([...state.loadedPages, pageNumber])],
    //   centerPage: pageNumber,
    // };

    // const cacheRadius = 2;
    // const min = pageNumber - cacheRadius;
    // const max = pageNumber + cacheRadius;
    // const pagesToKeep = state.loadedPages.filter((p) => p >= min && p <= max);
    // const pagesToRemove = state.loadedPages.filter((p) => p < min || p > max);
    // for (const p of pagesToRemove) {
    //   const start = p * pageSize;
    //   const end = start + pageSize;
    //   const idsToRemove = state.ids.slice(start, end) as string[];
    //   state = textRoomAdapter.removeMany(idsToRemove, state);
    // }
    // return {
    //   ...state,
    //   loadedPages: pagesToKeep,
    // };
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
);
