import { DestroyRef, computed, effect, inject } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { ITextRoomMessage } from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import {
  addEntity,
  removeEntity,
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { TuiNotificationService } from '@taiga-ui/core';
import { Subject, Subscription } from 'rxjs';
import { TextRoomApiService } from '../text-room-api.service';
import { AttachmentsApiService } from './attachments-api.service';
import {
  ILocalFile,
  IOutgoingFile,
  IOutgoingMessage,
  isBlankMessageContent,
  revokeLocalFiles,
  TAttachmentUploadErrorCode,
} from './outgoing.types';

const uploadConcurrency = 3;
const outgoingId = (message: IOutgoingMessage) => message.tempId;

type OutgoingState = {
  uploadProgress: Record<string, number>;
};

export const OutgoingMessagesStore = signalStore(
  { providedIn: 'root' },
  withState<OutgoingState>({ uploadProgress: {} }),
  withEntities<IOutgoingMessage>(),
  withProps(() => {
    const created$ = new Subject<ITextRoomMessage>();
    return {
      created$,
      messageCreated$: created$.asObservable(),
      subscriptions: new Map<string, Subscription>(),
      waiting: [] as string[],
      active: 0,
      cancelled: new Set<string>(),
      creating: new Set<string>(),
      progressAt: new Map<string, number>(),
    };
  }),
  withComputed(({ entities }) => ({
    hasActive: computed(() =>
      entities().some(
        (message) =>
          message.state.phase === 'uploading' ||
          message.state.phase === 'creating',
      ),
    ),
  })),
  withMethods(
    (
      store,
      attachmentsApi = inject(AttachmentsApiService),
      textRoomApi = inject(TextRoomApiService),
      ngrxStore = inject(Store),
      translateService = inject(TranslateService),
      notifications = inject(TuiNotificationService),
    ) => {
      const currentUser = ngrxStore.selectSignal(selectCurrentUser);

      const showError = (error: unknown): void => {
        notifications
          .open(parseError(error), {
            appearance: 'negative',
            autoClose: 5000,
            closable: true,
            label: translateService.instant('GENERAL.REQ_ERR'),
          })
          .subscribe();
      };

      const replace = (message: IOutgoingMessage): void => {
        patchState(store, setEntity(message, { selectId: outgoingId }));
      };

      const dropProgress = (localIds: readonly string[]): void => {
        if (localIds.length === 0) {
          return;
        }
        patchState(store, (state) => {
          const uploadProgress = { ...state.uploadProgress };
          for (const localId of localIds) {
            delete uploadProgress[localId];
            store.progressAt.delete(localId);
          }
          return { uploadProgress };
        });
      };

      const forgetWaiting = (localId: string): void => {
        store.waiting = store.waiting.filter((id) => id !== localId);
      };

      const releaseUpload = (localId: string): void => {
        store.subscriptions.delete(localId);
        if (store.cancelled.delete(localId)) {
          return;
        }
        store.active = Math.max(0, store.active - 1);
      };

      const settle = (
        message: IOutgoingMessage,
      ): IOutgoingMessage | 'remove' => {
        if (
          message.files.length === 0 &&
          isBlankMessageContent(message.data.content)
        ) {
          return 'remove';
        }
        if (message.state.phase === 'failed') {
          return message;
        }
        const pending = message.files.some(
          (file) =>
            file.state.status === 'queued' || file.state.status === 'uploading',
        );
        if (pending) {
          return message;
        }
        const failed = message.files.some(
          (file) => file.state.status === 'failed',
        );
        if (failed) {
          return { ...message, state: { phase: 'failed', reason: 'upload' } };
        }
        return { ...message, state: { phase: 'creating' } };
      };

      const startCreate = (tempId: string): void => {
        const message = store.entityMap()[tempId];
        if (!message || message.state.phase !== 'creating') {
          return;
        }
        if (store.creating.has(tempId)) {
          return;
        }
        store.creating.add(tempId);
        const attachmentIds = message.files.flatMap((file) =>
          file.state.status === 'uploaded' ? [file.state.attachment.id] : [],
        );
        textRoomApi
          .create({
            ...message.data,
            clientId: tempId,
            attachmentIds,
          })
          .subscribe({
            next: (created) => {
              store.creating.delete(tempId);
              if (!store.entityMap()[tempId]) {
                return;
              }
              resolve(created);
            },
            error: (error: unknown) => {
              store.creating.delete(tempId);
              if (!store.entityMap()[tempId]) {
                return;
              }
              handleCreateError(tempId, error);
            },
          });
      };

      const applySettled = (message: IOutgoingMessage): void => {
        const next = settle(message);
        if (next === 'remove') {
          revokeLocalFiles(message.files);
          dropProgress(message.files.map((file) => file.localId));
          patchState(store, removeEntity(message.tempId));
          return;
        }
        replace(next);
        if (next.state.phase === 'creating') {
          startCreate(next.tempId);
        }
      };

      const pump = (): void => {
        while (store.active < uploadConcurrency && store.waiting.length > 0) {
          const localId = store.waiting.shift();
          if (!localId) {
            return;
          }
          const message = store
            .entities()
            .find((item) =>
              item.files.some((file) => file.localId === localId),
            );
          const file = message?.files.find((item) => item.localId === localId);
          if (!message || !file || file.state.status !== 'queued') {
            continue;
          }
          startUpload(message.tempId, file);
        }
      };

      const startUpload = (tempId: string, file: IOutgoingFile): void => {
        const message = store.entityMap()[tempId];
        if (!message) {
          return;
        }
        replace({
          ...message,
          files: message.files.map((item) =>
            item.localId === file.localId
              ? { ...item, state: { status: 'uploading' } }
              : item,
          ),
        });
        store.active += 1;
        const subscription = attachmentsApi.upload(file.file).subscribe({
          next: (event) => {
            if (store.cancelled.has(file.localId)) {
              return;
            }
            if (event.type === HttpEventType.UploadProgress && event.total) {
              const value = event.loaded / event.total;
              const previous = store.uploadProgress()[file.localId] ?? 0;
              const now = Date.now();
              const last = store.progressAt.get(file.localId) ?? 0;
              if (value - previous < 0.01 && now - last < 100 && value < 1) {
                return;
              }
              store.progressAt.set(file.localId, now);
              patchState(store, (state) => ({
                uploadProgress: {
                  ...state.uploadProgress,
                  [file.localId]: value,
                },
              }));
            }
            if (event.type === HttpEventType.Response && event.body) {
              const uploaded = event.body;
              const current = store.entityMap()[tempId];
              if (!current) {
                return;
              }
              replace({
                ...current,
                files: current.files.map((item) =>
                  item.localId === file.localId
                    ? {
                        ...item,
                        state: { status: 'uploaded', attachment: uploaded },
                      }
                    : item,
                ),
              });
            }
          },
          error: (error: unknown) => {
            releaseUpload(file.localId);
            const current = store.entityMap()[tempId];
            if (!current) {
              pump();
              return;
            }
            replace({
              ...current,
              files: current.files.map((item) =>
                item.localId === file.localId
                  ? {
                      ...item,
                      state: { status: 'failed', code: uploadErrorCode(error) },
                    }
                  : item,
              ),
            });
            const updated = store.entityMap()[tempId];
            if (updated) {
              applySettled(updated);
            }
            pump();
          },
          complete: () => {
            releaseUpload(file.localId);
            const updated = store.entityMap()[tempId];
            if (updated) {
              applySettled(updated);
            }
            pump();
          },
        });
        store.subscriptions.set(file.localId, subscription);
      };

      const handleCreateError = (tempId: string, error: unknown): void => {
        const current = store.entityMap()[tempId];
        if (!current) {
          return;
        }
        if (
          error instanceof HttpErrorResponse &&
          error.status === 409 &&
          error.error?.message === 'ATTACHMENTS_UNAVAILABLE'
        ) {
          const missing = new Set<string>(
            Array.isArray(error.error.attachmentIds)
              ? error.error.attachmentIds
              : [],
          );
          replace({
            ...current,
            state: { phase: 'failed', reason: 'upload' },
            files: current.files.map((file) =>
              file.state.status === 'uploaded' &&
              missing.has(file.state.attachment.id)
                ? { ...file, state: { status: 'failed', code: 'expired' } }
                : file,
            ),
          });
          return;
        }
        replace({ ...current, state: { phase: 'failed', reason: 'create' } });
        showError(error);
      };

      const abortFile = (file: IOutgoingFile): void => {
        forgetWaiting(file.localId);
        const subscription = store.subscriptions.get(file.localId);
        if (subscription) {
          store.cancelled.add(file.localId);
          subscription.unsubscribe();
          store.subscriptions.delete(file.localId);
          store.active = Math.max(0, store.active - 1);
        }
        if (file.state.status === 'uploaded') {
          attachmentsApi.delete(file.state.attachment.id).subscribe({
            error: () => undefined,
          });
        }
      };

      const resolve = (message: ITextRoomMessage): boolean => {
        const user = currentUser();
        const clientId = message.clientId;
        if (!clientId || !user || message.senderId !== user.id) {
          return false;
        }
        const outgoing = store.entityMap()[clientId];
        if (!outgoing) {
          return false;
        }
        for (const file of outgoing.files) {
          const subscription = store.subscriptions.get(file.localId);
          if (subscription) {
            store.cancelled.add(file.localId);
            subscription.unsubscribe();
            store.subscriptions.delete(file.localId);
            store.active = Math.max(0, store.active - 1);
          }
          forgetWaiting(file.localId);
        }
        store.creating.delete(clientId);
        revokeLocalFiles(outgoing.files);
        dropProgress(outgoing.files.map((file) => file.localId));
        patchState(store, removeEntity(clientId));
        store.created$.next(message);
        return true;
      };

      return {
        resolve,

        send({
          tempId,
          data,
          replyTo,
          files,
        }: {
          tempId: string;
          data: IOutgoingMessage['data'];
          replyTo: IOutgoingMessage['replyTo'];
          files: readonly ILocalFile[];
        }): void {
          const outgoingFiles: IOutgoingFile[] = files.map((file) => ({
            ...file,
            state: { status: 'queued' },
          }));
          const message: IOutgoingMessage = {
            tempId,
            data,
            replyTo,
            createdAt: new Date(),
            files: outgoingFiles,
            state:
              outgoingFiles.length === 0
                ? { phase: 'creating' }
                : { phase: 'uploading' },
          };
          patchState(store, addEntity(message, { selectId: outgoingId }));
          if (outgoingFiles.length === 0) {
            startCreate(tempId);
            return;
          }
          for (const file of outgoingFiles) {
            store.waiting.push(file.localId);
          }
          pump();
        },

        removeFile(tempId: string, localId: string): void {
          const message = store.entityMap()[tempId];
          if (!message || message.state.phase === 'creating') {
            return;
          }
          const file = message.files.find((item) => item.localId === localId);
          if (!file) {
            return;
          }
          abortFile(file);
          if (file.previewUrl) {
            URL.revokeObjectURL(file.previewUrl);
          }
          dropProgress([localId]);
          applySettled({
            ...message,
            files: message.files.filter((item) => item.localId !== localId),
          });
          pump();
        },

        retry(tempId: string): void {
          const message = store.entityMap()[tempId];
          if (!message || message.state.phase !== 'failed') {
            return;
          }
          const files = message.files.map((file) =>
            file.state.status === 'failed'
              ? { ...file, state: { status: 'queued' as const } }
              : file,
          );
          const needsUpload = files.some(
            (file) => file.state.status === 'queued',
          );
          const next: IOutgoingMessage = {
            ...message,
            files,
            state: needsUpload ? { phase: 'uploading' } : { phase: 'creating' },
          };
          replace(next);
          if (!needsUpload) {
            startCreate(tempId);
            return;
          }
          for (const file of files) {
            if (file.state.status === 'queued') {
              store.waiting.push(file.localId);
            }
          }
          pump();
        },

        cancel(tempId: string): void {
          const message = store.entityMap()[tempId];
          if (!message || message.state.phase === 'creating') {
            return;
          }
          for (const file of message.files) {
            abortFile(file);
          }
          revokeLocalFiles(message.files);
          dropProgress(message.files.map((file) => file.localId));
          store.creating.delete(tempId);
          patchState(store, removeEntity(tempId));
          pump();
        },

        cancelAll(): void {
          for (const message of [...store.entities()]) {
            if (message.state.phase === 'creating') {
              continue;
            }
            for (const file of message.files) {
              abortFile(file);
            }
            revokeLocalFiles(message.files);
            dropProgress(message.files.map((file) => file.localId));
            patchState(store, removeEntity(message.tempId));
          }
          pump();
        },
      };
    },
  ),
  withHooks({
    onInit(store) {
      const destroyRef = inject(DestroyRef);
      const onBeforeUnload = (event: BeforeUnloadEvent): void => {
        event.preventDefault();
      };
      effect(() => {
        const active = store.hasActive();
        if (active) {
          window.addEventListener('beforeunload', onBeforeUnload);
        } else {
          window.removeEventListener('beforeunload', onBeforeUnload);
        }
      });
      destroyRef.onDestroy(() => {
        window.removeEventListener('beforeunload', onBeforeUnload);
      });
    },
  }),
);

function uploadErrorCode(error: unknown): TAttachmentUploadErrorCode {
  if (!(error instanceof HttpErrorResponse)) {
    return 'server';
  }
  switch (error.status) {
    case 413:
      return 'tooLarge';
    case 403:
      return 'disabled';
    case 429:
      return 'rateLimited';
    case 507:
      return 'storageFull';
    case 0:
      return 'network';
    default:
      return 'server';
  }
}
