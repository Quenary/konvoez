import { TestBed } from '@angular/core/testing';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
  HttpResponse,
} from '@angular/common/http';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import {
  EAttachmentKind,
  EUserRole,
  IAttachment,
  ITextRoomMessage,
  IUser,
} from '@konvoez/shared';
import { authReducer } from '@features/auth/auth.reducer';
import { AuthActions } from '@features/auth/auth.actions';
import { Observable, Subject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextRoomApiService } from '../text-room-api.service';
import { AttachmentsApiService } from './attachments-api.service';
import { OutgoingMessagesStore } from './outgoing-messages.store';
import { ILocalFile } from './outgoing.types';

describe('OutgoingMessagesStore', () => {
  let store: InstanceType<typeof OutgoingMessagesStore>;
  let create: ReturnType<typeof vi.fn>;
  let upload: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let notifications: { open: ReturnType<typeof vi.fn> };
  const uploads = new Map<
    string,
    {
      next: (event: HttpEvent<IAttachment>) => void;
      error: (error: unknown) => void;
      complete: () => void;
    }
  >();
  const aborted = new Set<string>();

  const user: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: null,
  };

  function attachment(id: string, name: string): IAttachment {
    return {
      id,
      kind: EAttachmentKind.FILE,
      name,
      mime: 'text/plain',
      size: 4,
      width: null,
      height: null,
      url: `/api/v1/attachments/${id}/content`,
      thumbnailUrl: null,
    };
  }

  function localFile(name: string): ILocalFile {
    return {
      localId: name,
      file: new File(['data'], name, { type: 'text/plain' }),
      kind: EAttachmentKind.FILE,
      previewUrl: `blob:${name}`,
    };
  }

  function serverMessage(clientId: string): ITextRoomMessage {
    return {
      id: `server-${clientId}`,
      senderId: 1,
      senderUsername: 'alice',
      roomId: 10,
      recipientId: null,
      content: 'ok',
      createdAt: new Date('2026-10-02T00:00:00.000Z'),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId,
      replyTo: null,
    };
  }

  beforeEach(() => {
    uploads.clear();
    aborted.clear();
    create = vi.fn(() => new Subject<ITextRoomMessage>().asObservable());
    upload = vi.fn(
      (file: File) =>
        new Observable<HttpEvent<IAttachment>>((subscriber) => {
          uploads.set(file.name, subscriber);
          return () => {
            aborted.add(file.name);
          };
        }),
    );
    remove = vi.fn(() => of(undefined));
    notifications = { open: vi.fn(() => of(undefined)) };
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: TextRoomApiService, useValue: { create } },
        {
          provide: AttachmentsApiService,
          useValue: { upload, delete: remove },
        },
        { provide: TuiNotificationService, useValue: notifications },
      ],
    });
    TestBed.inject(Store).dispatch(AuthActions.requestLoginSuccess({ user }));
    store = TestBed.inject(OutgoingMessagesStore);
  });

  it('creates a message without files and emits it once', () => {
    const created$ = new Subject<ITextRoomMessage>();
    create.mockReturnValue(created$.asObservable());
    const received: ITextRoomMessage[] = [];
    store.messageCreated$.subscribe((message) => received.push(message));

    store.send({
      tempId: 'temp-1',
      data: {
        content: 'hi',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [],
    });

    expect(store.entityMap()['temp-1']?.state).toEqual({ phase: 'creating' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'temp-1', attachmentIds: [] }),
    );
    const message = serverMessage('temp-1');
    created$.next(message);
    expect(received).toEqual([message]);
    expect(store.entityMap()['temp-1']).toBeUndefined();
    created$.error(new Error('late'));
    expect(store.entityMap()['temp-1']).toBeUndefined();
    expect(notifications.open).not.toHaveBeenCalled();
  });

  it('uploads at most three files at once and creates with ids in pick order', () => {
    const names = ['a.txt', 'b.txt', 'c.txt', 'd.txt'];
    store.send({
      tempId: 'temp-2',
      data: {
        content: '',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: names.map(localFile),
    });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(uploads.has('d.txt')).toBe(false);

    const ids: Record<string, string> = {
      'a.txt': '11111111-1111-4111-8111-111111111111',
      'b.txt': '11111111-1111-4111-8111-111111111112',
      'c.txt': '11111111-1111-4111-8111-111111111113',
      'd.txt': '22222222-2222-4222-8222-222222222222',
    };
    for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
      uploads
        .get(name)
        ?.next(new HttpResponse({ body: attachment(ids[name], name) }));
      uploads.get(name)?.complete();
    }
    expect(upload).toHaveBeenCalledTimes(4);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'temp-2',
        attachmentIds: [ids['a.txt'], ids['b.txt'], ids['c.txt'], ids['d.txt']],
      }),
    );
  });

  it('frees the upload slot when the upload fails before the request starts', () => {
    upload.mockImplementation(
      () =>
        new Observable<HttpEvent<IAttachment>>((subscriber) => {
          subscriber.error(new Error('sync'));
        }),
    );
    store.send({
      tempId: 'temp-sync',
      data: {
        content: 'x',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: ['a.txt', 'b.txt', 'c.txt', 'd.txt'].map(localFile),
    });
    expect(upload).toHaveBeenCalledTimes(4);
    const message = store.entityMap()['temp-sync'];
    expect(message?.files.map((file) => file.state.status)).toEqual([
      'failed',
      'failed',
      'failed',
      'failed',
    ]);
    expect(message?.state).toEqual({ phase: 'failed', reason: 'upload' });
  });

  it('keeps the message failed when one upload fails and retries only that file', () => {
    store.send({
      tempId: 'temp-3',
      data: {
        content: 'x',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('ok.txt'), localFile('bad.txt')],
    });
    uploads.get('ok.txt')?.next(
      new HttpResponse({
        body: attachment('33333333-3333-4333-8333-333333333333', 'ok.txt'),
      }),
    );
    uploads.get('ok.txt')?.complete();
    uploads.get('bad.txt')?.error(new HttpErrorResponse({ status: 500 }));
    expect(create).not.toHaveBeenCalled();
    expect(store.entityMap()['temp-3']?.state).toEqual({
      phase: 'failed',
      reason: 'upload',
    });

    store.retry('temp-3');
    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls.at(-1)?.[0].name).toBe('bad.txt');
  });

  it('aborts an uploading file and still creates the message', () => {
    store.send({
      tempId: 'temp-4',
      data: {
        content: 'x',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('keep.txt'), localFile('drop.txt')],
    });
    store.removeFile('temp-4', 'drop.txt');
    expect(aborted.has('drop.txt')).toBe(true);
    uploads.get('keep.txt')?.next(
      new HttpResponse({
        body: attachment('44444444-4444-4444-8444-444444444444', 'keep.txt'),
      }),
    );
    uploads.get('keep.txt')?.complete();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: ['44444444-4444-4444-8444-444444444444'],
      }),
    );
  });

  it('deletes an uploaded file and removes an empty message', () => {
    store.send({
      tempId: 'temp-5',
      data: {
        content: '',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('only.txt')],
    });
    uploads.get('only.txt')?.next(
      new HttpResponse({
        body: attachment('55555555-5555-4555-8555-555555555555', 'only.txt'),
      }),
    );
    store.removeFile('temp-5', 'only.txt');
    expect(remove).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(store.entityMap()['temp-5']).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:only.txt');
  });

  it('marks listed files expired after a 409 and ignores a late success', () => {
    const created$ = new Subject<ITextRoomMessage>();
    create.mockReturnValue(created$.asObservable());
    store.send({
      tempId: 'temp-6',
      data: {
        content: 'x',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('gone.txt')],
    });
    uploads.get('gone.txt')?.next(
      new HttpResponse({
        body: attachment('66666666-6666-4666-8666-666666666666', 'gone.txt'),
      }),
    );
    uploads.get('gone.txt')?.complete();
    created$.error(
      new HttpErrorResponse({
        status: 409,
        error: {
          message: 'ATTACHMENTS_UNAVAILABLE',
          attachmentIds: ['66666666-6666-4666-8666-666666666666'],
        },
      }),
    );
    const file = store.entityMap()['temp-6']?.files[0];
    expect(file?.state).toEqual({ status: 'failed', code: 'expired' });
    expect(store.resolve(serverMessage('missing'))).toBe(false);
    const echoed = serverMessage('temp-6');
    expect(store.resolve(echoed)).toBe(true);
    created$.next(echoed);
    expect(store.entityMap()['temp-6']).toBeUndefined();
  });

  it('stores upload progress and toggles the beforeunload listener', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    store.send({
      tempId: 'temp-7',
      data: {
        content: 'x',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('big.txt')],
    });
    expect(store.hasActive()).toBe(true);
    TestBed.flushEffects();
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    uploads.get('big.txt')?.next({
      type: HttpEventType.UploadProgress,
      loaded: 50,
      total: 100,
    });
    expect(store.uploadProgress()['big.txt']).toBe(0.5);
    store.cancel('temp-7');
    TestBed.flushEffects();
    expect(store.hasActive()).toBe(false);
    expect(removeListener).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:big.txt');
  });

  it('treats a REST response as a no-op when the socket echo arrived first', () => {
    const created$ = new Subject<ITextRoomMessage>();
    create.mockReturnValue(created$.asObservable());
    const received: ITextRoomMessage[] = [];
    store.messageCreated$.subscribe((message) => received.push(message));
    store.send({
      tempId: 'temp-echo',
      data: {
        content: 'hi',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [],
    });
    const echoed = serverMessage('temp-echo');
    expect(store.resolve(echoed)).toBe(true);
    created$.next(echoed);
    expect(received).toEqual([echoed]);
    expect(store.entities()).toEqual([]);
  });

  it('completes two sends that are in flight together', () => {
    const first$ = new Subject<ITextRoomMessage>();
    const second$ = new Subject<ITextRoomMessage>();
    create.mockReturnValueOnce(first$).mockReturnValueOnce(second$);
    const received: string[] = [];
    store.messageCreated$.subscribe((message) => received.push(message.id));
    const payload = {
      content: 'hi',
      roomId: 10,
      recipientId: null,
      replyToId: null,
      attachmentIds: [] as string[],
    };
    store.send({
      tempId: 'temp-a',
      data: payload,
      replyTo: null,
      files: [],
    });
    store.send({
      tempId: 'temp-b',
      data: payload,
      replyTo: null,
      files: [],
    });
    first$.next(serverMessage('temp-a'));
    second$.next(serverMessage('temp-b'));
    expect(received).toEqual(['server-temp-a', 'server-temp-b']);
    expect(store.entities()).toEqual([]);
  });

  it('cancels uploads and deletes files that already uploaded', () => {
    store.send({
      tempId: 'temp-cancel',
      data: {
        content: 'x',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('stay.txt'), localFile('gone.txt')],
    });
    uploads.get('stay.txt')?.next(
      new HttpResponse({
        body: attachment('77777777-7777-4777-8777-777777777777', 'stay.txt'),
      }),
    );
    uploads.get('stay.txt')?.complete();
    store.cancel('temp-cancel');
    expect(aborted.has('gone.txt')).toBe(true);
    expect(remove).toHaveBeenCalledWith('77777777-7777-4777-8777-777777777777');
    expect(store.entityMap()['temp-cancel']).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stay.txt');
  });

  it('drops a creating message on cancelAll and ignores the late response', () => {
    const created$ = new Subject<ITextRoomMessage>();
    create.mockReturnValue(created$.asObservable());
    store.send({
      tempId: 'temp-logout',
      data: {
        content: 'hi',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [],
    });
    expect(store.entityMap()['temp-logout']?.state.phase).toBe('creating');
    store.cancelAll();
    expect(store.entities()).toEqual([]);
    created$.next(serverMessage('temp-logout'));
    expect(store.entities()).toEqual([]);
  });

  it('keeps a failed message failed after its failed file is removed', () => {
    store.send({
      tempId: 'temp-fail',
      data: {
        content: 'x',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('ok.txt'), localFile('bad.txt')],
    });
    uploads.get('ok.txt')?.next(
      new HttpResponse({
        body: attachment('88888888-8888-4888-8888-888888888888', 'ok.txt'),
      }),
    );
    uploads.get('ok.txt')?.complete();
    uploads.get('bad.txt')?.error(new HttpErrorResponse({ status: 413 }));
    store.removeFile('temp-fail', 'bad.txt');
    expect(store.entityMap()['temp-fail']?.state).toEqual({
      phase: 'failed',
      reason: 'upload',
    });
    expect(store.entityMap()['temp-fail']?.files).toHaveLength(1);
    store.retry('temp-fail');
    expect(store.entityMap()['temp-fail']?.state.phase).toBe('creating');
  });

  it('revokes object urls when the message resolves', () => {
    const created$ = new Subject<ITextRoomMessage>();
    create.mockReturnValue(created$.asObservable());
    store.send({
      tempId: 'temp-revoke',
      data: {
        content: '',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files: [localFile('pic.txt')],
    });
    uploads.get('pic.txt')?.next(
      new HttpResponse({
        body: attachment('99999999-9999-4999-8999-999999999999', 'pic.txt'),
      }),
    );
    uploads.get('pic.txt')?.complete();
    created$.next(serverMessage('temp-revoke'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pic.txt');
  });
});
