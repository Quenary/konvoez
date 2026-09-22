import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomMessageComponent } from './text-room-message.component';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import {
  TextRoomStore,
  EMessageStatus,
  IMessageEntity,
} from '../text-room.store';
import { UsersStore } from '@features/users/users.store';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { signal, Sanitizer } from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authReducer } from '@features/auth/auth.reducer';
import { AuthActions } from '@features/auth/auth.actions';
import { EUserRole, IUser } from '@konvoez/shared';
import { TextRoomApiService } from '../text-room-api.service';
import { MessageReadQueueService } from '../message-read-queue.service';

describe('TextRoomMessageComponent', () => {
  let component: TextRoomMessageComponent;
  let fixture: ComponentFixture<TextRoomMessageComponent>;

  const mockTextRoomStore = {
    setReplyToMessageId: vi.fn(),
    setEditableMessageId: vi.fn(),
    deleteMessage: vi.fn(),
    jumpToMessage: vi.fn(),
  };

  const mockUsersStore = {
    entityMap: signal({}),
  };

  const mockNotificationService = {
    open: vi.fn(() => of(undefined)),
  };
  const mockDialogService = {
    open: vi.fn(() => of(undefined)),
  };
  const mockTextRoomApi = {
    getReaders: vi.fn(() => of<IUser[]>([])),
    markRead: vi.fn(() => of(undefined)),
  };
  const currentUser: IUser = {
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

  const testMessage: IMessageEntity = {
    id: 'msg-1',
    content: '<p>Hello world</p>',
    senderId: 1,
    senderUsername: 'alice',
    roomId: 1,
    recipientId: null,
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: null,
    isRead: false,
    status: EMessageStatus.SUCCESS,
    replyTo: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    }

    await TestBed.configureTestingModule({
      imports: [TextRoomMessageComponent],
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        {
          provide: Sanitizer,
          useValue: {
            sanitize: vi.fn((_ctx: unknown, val: string | null) => val ?? ''),
          },
        },
        { provide: TextRoomStore, useValue: mockTextRoomStore },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: TuiNotificationService, useValue: mockNotificationService },
        { provide: TuiDialogService, useValue: mockDialogService },
        { provide: TextRoomApiService, useValue: mockTextRoomApi },
        {
          provide: MessageReadQueueService,
          useValue: { enqueue: vi.fn(), reset: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TextRoomMessageComponent);
    fixture.componentRef.setInput('message', testMessage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sanitize HTML message content', () => {
    fixture.componentRef.setInput('message', {
      ...testMessage,
      content: '<p>test</p><script>alert(1)</script>',
    });
    fixture.detectChanges();
    // sanitizedContent is a computed signal
    expect(
      (
        component as unknown as { sanitizedContent: () => string }
      ).sanitizedContent(),
    ).toBeTruthy();
  });

  it('should set reply target when replyMessage is called', () => {
    (component as unknown as { replyMessage: () => void }).replyMessage();
    expect(mockTextRoomStore.setReplyToMessageId).toHaveBeenCalledWith('msg-1');
  });

  it('should set editable message when editMessage is called', () => {
    (component as unknown as { editMessage: () => void }).editMessage();
    expect(mockTextRoomStore.setEditableMessageId).toHaveBeenCalledWith(
      'msg-1',
    );
  });

  it('should delete message when deleteMessage is called', () => {
    (component as unknown as { deleteMessage: () => void }).deleteMessage();
    expect(mockTextRoomStore.deleteMessage).toHaveBeenCalledWith('msg-1');
  });

  it('should jump to target message on quote click when not deleted', () => {
    const reply = {
      id: 'target-1',
      senderId: 2,
      senderUsername: 'bob',
      content: 'hi',
      isDeleted: false,
    };
    (
      component as unknown as { onReplyQuoteClick: (r: typeof reply) => void }
    ).onReplyQuoteClick(reply);
    expect(mockTextRoomStore.jumpToMessage).toHaveBeenCalledWith('target-1');
  });

  it('should show notification on quote click when original message is deleted', () => {
    const reply = {
      id: 'target-2',
      senderId: null,
      senderUsername: null,
      content: null,
      isDeleted: true,
    };
    (
      component as unknown as { onReplyQuoteClick: (r: typeof reply) => void }
    ).onReplyQuoteClick(reply);
    expect(mockNotificationService.open).toHaveBeenCalled();
    expect(mockTextRoomStore.jumpToMessage).not.toHaveBeenCalled();
  });

  it('should expose sent and read status only for own messages', () => {
    const componentWithStatus = component as unknown as {
      readStatus: () => 'sent' | 'read' | null;
    };
    expect(componentWithStatus.readStatus()).toBeNull();

    TestBed.inject(Store).dispatch(
      AuthActions.requestLoginSuccess({ user: currentUser }),
    );
    fixture.detectChanges();
    expect(componentWithStatus.readStatus()).toBe('sent');

    fixture.componentRef.setInput('message', { ...testMessage, isRead: true });
    fixture.detectChanges();
    expect(componentWithStatus.readStatus()).toBe('read');
  });

  it('should load readers and open the dialog', () => {
    const readers = [{ ...currentUser, id: 2, username: 'bob' }];
    mockTextRoomApi.getReaders.mockReturnValue(of(readers));

    (
      component as unknown as {
        showReadersDialog: (template: unknown) => void;
      }
    ).showReadersDialog('tmpl');

    expect(mockTextRoomApi.getReaders).toHaveBeenCalledWith('msg-1');
    expect(
      (component as unknown as { readers: () => IUser[] }).readers(),
    ).toEqual(readers);
    expect(mockDialogService.open).toHaveBeenCalled();
  });

  it('should stop loading readers when the request fails', () => {
    mockTextRoomApi.getReaders.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    (
      component as unknown as {
        showReadersDialog: (template: unknown) => void;
      }
    ).showReadersDialog('tmpl');

    expect(
      (component as unknown as { readersLoading: () => boolean }).readersLoading(),
    ).toBe(false);
  });
});
