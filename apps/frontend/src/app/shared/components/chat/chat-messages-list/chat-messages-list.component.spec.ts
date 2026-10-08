import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessagesListComponent } from './chat-messages-list.component';
import { provideStore } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { ChatStore, EMessageStatus, IMessageEntity } from '../chat.store';
import { UsersStore } from '@core/stores/users.store';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import { Sanitizer, signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authReducer } from '@features/auth/auth.reducer';
import { TextRoomApiService } from '@core/chat/text-room-api.service';
import { MessageReadQueueService } from '@core/chat/message-read-queue.service';

describe('ChatMessagesListComponent', () => {
  let component: ChatMessagesListComponent;
  let fixture: ComponentFixture<ChatMessagesListComponent>;

  const mockMessages: IMessageEntity[] = [
    {
      id: 'msg-1',
      content: '<p>First</p>',
      senderId: 1,
      senderUsername: 'alice',
      roomId: 1,
      recipientId: null,
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: null,
      status: EMessageStatus.SUCCESS,
      replyTo: null,
    },
    {
      id: 'msg-2',
      content: '<p>Second with reply</p>',
      senderId: 2,
      senderUsername: 'bob',
      roomId: 1,
      recipientId: null,
      createdAt: new Date('2026-09-15T00:01:00.000Z'),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: null,
      status: EMessageStatus.SUCCESS,
      replyTo: {
        id: 'msg-1',
        senderId: 1,
        senderUsername: 'alice',
        content: '<p>First</p>',
        isDeleted: false,
      },
    },
  ];

  const mockChatStore = {
    messages: signal<IMessageEntity[]>(mockMessages),
    targetScrollMessageId: signal<string | null>(null),
    setTargetScrollMessageId: vi.fn(),
    requestPrevPage: vi.fn(),
    requestNextPage: vi.fn(),
    target: signal<{ kind: 'room'; id: number } | null>({
      kind: 'room',
      id: 1,
    }),
    setReplyToMessageId: vi.fn(),
    setEditableMessageId: vi.fn(),
    deleteMessage: vi.fn(),
    jumpToMessage: vi.fn(),
  };

  const mockUsersStore = {
    entityMap: signal({}),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockChatStore.messages.set(mockMessages);
    mockChatStore.targetScrollMessageId.set(null);
    Element.prototype.scrollTo = vi.fn();

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
      imports: [ChatMessagesListComponent],
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        {
          provide: Sanitizer,
          useValue: {
            sanitize: vi.fn((_ctx: unknown, val: string | null) => val ?? ''),
          },
        },
        { provide: ChatStore, useValue: mockChatStore },
        { provide: UsersStore, useValue: mockUsersStore },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn(() => of(undefined)) },
        },
        {
          provide: TextRoomApiService,
          useValue: { getReaders: vi.fn(), markRead: vi.fn() },
        },
        {
          provide: MessageReadQueueService,
          useValue: { enqueue: vi.fn(), reset: vi.fn() },
        },
        {
          provide: OutgoingMessagesStore,
          useValue: { uploadProgress: signal({}) },
        },
        {
          provide: TuiDialogService,
          useValue: { open: vi.fn(() => of(undefined)) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatMessagesListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call requestPrevPage on onScrollUp', () => {
    component.onScrollUp();
    expect(mockChatStore.requestPrevPage).toHaveBeenCalled();
  });

  it('should call requestNextPage on onScrolled', () => {
    component.onScrolled();
    expect(mockChatStore.requestNextPage).toHaveBeenCalled();
  });

  it('scrolls once when an outgoing message appears and not on later updates', () => {
    fixture.detectChanges();
    const scroll = vi.spyOn(component, 'scrollToBottom');
    const outgoing = {
      ...mockMessages[1],
      id: 'out-1',
      outgoing: {
        tempId: 'out-1',
        data: {
          content: '<p>Second with reply</p>',
          roomId: 1,
          recipientId: null,
          replyToId: null,
          attachmentIds: [],
        },
        replyTo: null,
        createdAt: mockMessages[1].createdAt,
        files: [],
        state: { phase: 'uploading' as const },
      },
    };
    mockChatStore.messages.set([...mockMessages, outgoing]);
    TestBed.flushEffects();
    expect(scroll).toHaveBeenCalledTimes(1);

    mockChatStore.messages.set([
      ...mockMessages,
      { ...outgoing, content: '<p>progress</p>' },
    ]);
    TestBed.flushEffects();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('scrolls to the bottom when a new message arrives while already at the bottom', () => {
    fixture.detectChanges();
    const scroll = vi.spyOn(component, 'scrollToBottom');
    mockChatStore.messages.set([
      ...mockMessages,
      {
        ...mockMessages[0],
        id: 'msg-3',
        content: '<p>Third</p>',
        createdAt: new Date('2026-09-15T00:02:00.000Z'),
      },
    ]);
    TestBed.flushEffects();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('keeps the scroll position when a new message arrives above the bottom', () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector(
      '.scroll-container',
    ) as HTMLDivElement;
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 1200,
    });
    container.dispatchEvent(new Event('scroll'));

    const scroll = vi.spyOn(component, 'scrollToBottom');
    mockChatStore.messages.set([
      ...mockMessages,
      {
        ...mockMessages[0],
        id: 'msg-3',
        content: '<p>Third</p>',
        createdAt: new Date('2026-09-15T00:02:00.000Z'),
      },
    ]);
    TestBed.flushEffects();
    expect(scroll).not.toHaveBeenCalled();
  });
});

function setScroll(
  element: HTMLElement,
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number },
): void {
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    value: metrics.scrollTop,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: metrics.clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: metrics.scrollHeight,
  });
}
