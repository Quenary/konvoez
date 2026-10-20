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
import { authReducer } from '@core/auth/auth.reducer';
import { ChatApiService } from '@core/api/chat-api.service';
import { MessageReadQueueService } from '@core/chat/message-read-queue.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { ChatTarget } from '../chat-target';

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
      reactions: [],
      mentions: { userIds: [], roleIds: [], everyone: false },
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
      reactions: [],
      mentions: { userIds: [], roleIds: [], everyone: false },
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
    target: signal<ChatTarget | null>({
      kind: 'room',
      id: 1,
    }),
    setReplyToMessageId: vi.fn(),
    setEditableMessageId: vi.fn(),
    deleteMessage: vi.fn(),
    jumpToMessage: vi.fn(),
    unreadDividerMessageId: signal<string | null>(null),
    initialPosition: signal<'bottom' | 'unread' | 'message' | null>('bottom'),
    hasMoreAfter: signal<boolean>(false),
    readAllAndJumpToLatest: vi.fn(),
  };

  const mockUsersStore = {
    entityMap: signal({}),
  };

  const mockUnreadCountsStore = {
    rooms: signal<Record<number, number>>({}),
    direct: signal<Record<number, number>>({}),
    chatUnreadCount: vi.fn((target: ChatTarget | null): number => {
      if (!target) {
        return 0;
      }
      return target.kind === 'room'
        ? (mockUnreadCountsStore.rooms()[target.id] ?? 0)
        : (mockUnreadCountsStore.direct()[target.id] ?? 0);
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockChatStore.messages.set(mockMessages);
    mockChatStore.targetScrollMessageId.set(null);
    mockChatStore.target.set({ kind: 'room', id: 1 });
    mockChatStore.unreadDividerMessageId.set(null);
    mockChatStore.initialPosition.set('bottom');
    mockChatStore.hasMoreAfter.set(false);
    mockUnreadCountsStore.rooms.set({});
    mockUnreadCountsStore.direct.set({});
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();

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
        { provide: UnreadCountsStore, useValue: mockUnreadCountsStore },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn(() => of(undefined)) },
        },
        {
          provide: ChatApiService,
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

  it('should render unread divider item before message matching unreadDividerMessageId', () => {
    mockChatStore.unreadDividerMessageId.set('msg-2');
    fixture.detectChanges();

    const divider = fixture.nativeElement.querySelector('#unread-divider');
    expect(divider).toBeTruthy();

    const children = Array.from(
      fixture.nativeElement.querySelector('.scroll-container')?.children ?? [],
    ) as HTMLElement[];
    const dividerIndex = children.findIndex((el) => el.id === 'unread-divider');
    const msg2Index = children.findIndex(
      (el) => el.querySelector('#message-msg-2') || el.id === 'message-msg-2',
    );
    expect(dividerIndex).toBeGreaterThan(-1);
    expect(msg2Index).toBe(dividerIndex + 1);
  });

  it('positions chat at unread divider when initialPosition is unread', async () => {
    mockChatStore.unreadDividerMessageId.set('msg-2');
    mockChatStore.initialPosition.set('unread');
    fixture.detectChanges();
    const divider = fixture.nativeElement.querySelector('#unread-divider');
    expect(divider).toBeTruthy();
    const scrollIntoView = vi.fn();
    divider.scrollIntoView = scrollIntoView;

    component['applyInitialPosition']();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'start',
    });
    expect(component['pinnedToBottom']).toBe(false);
  });

  it('falls back to scrollToBottom when initialPosition is unread but divider element is absent', async () => {
    mockChatStore.unreadDividerMessageId.set(null);
    mockChatStore.initialPosition.set('unread');
    const scroll = vi.spyOn(component, 'scrollToBottom');

    component['applyInitialPosition']();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(scroll).toHaveBeenCalled();
  });

  it('calls scrollToBottom when initialPosition is bottom', async () => {
    mockChatStore.initialPosition.set('bottom');
    const scroll = vi.spyOn(component, 'scrollToBottom');

    component['applyInitialPosition']();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(scroll).toHaveBeenCalled();
  });

  it('scrolls target message into view when initialPosition is message', async () => {
    mockChatStore.initialPosition.set('message');
    mockChatStore.targetScrollMessageId.set('msg-1');
    fixture.detectChanges();
    const msgEl = fixture.nativeElement.querySelector('#message-msg-1');
    expect(msgEl).toBeTruthy();
    const scrollIntoView = vi.fn();
    msgEl.scrollIntoView = scrollIntoView;

    component['applyInitialPosition']();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'center',
    });
    expect(mockChatStore.setTargetScrollMessageId).toHaveBeenCalledWith(null);
    expect(component['pinnedToBottom']).toBe(false);
  });

  it('preserves the visible message position when older and live messages are added together', async () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector(
      '.scroll-container',
    ) as HTMLDivElement;
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 800,
    });

    let anchorDocumentTop = 70;
    container.getBoundingClientRect = vi.fn(() => new DOMRect(0, 50, 400, 400));
    const firstMessage = container.querySelector(
      'app-chat-message',
    ) as HTMLElement;
    firstMessage.getBoundingClientRect = vi.fn(
      () => new DOMRect(0, anchorDocumentTop - container.scrollTop, 400, 40),
    );
    component.onScrollUp();
    container.dispatchEvent(new Event('scroll'));

    const scrollSpy = vi.spyOn(component, 'scrollToBottom');

    const liveMessage: IMessageEntity = {
      ...mockMessages[1],
      id: 'msg-live',
      createdAt: new Date('2026-09-16T00:00:00.000Z'),
    };
    mockChatStore.messages.set([...mockMessages, liveMessage]);
    fixture.detectChanges();

    const olderMessage: IMessageEntity = {
      ...mockMessages[0],
      id: 'msg-older',
      createdAt: new Date('2026-09-14T00:00:00.000Z'),
    };

    anchorDocumentTop = 670;
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 1200,
    });
    mockChatStore.messages.set([olderMessage, ...mockMessages, liveMessage]);
    fixture.detectChanges();

    expect(scrollSpy).not.toHaveBeenCalled();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.scrollTop).toBe(600);
    expect(
      firstMessage.getBoundingClientRect().top -
        container.getBoundingClientRect().top,
    ).toBe(20);
  });

  it('does not double-adjust when browser scroll anchoring already preserved the visible message', async () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector(
      '.scroll-container',
    ) as HTMLDivElement;
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 800,
    });

    let anchorDocumentTop = 70;
    container.getBoundingClientRect = vi.fn(() => new DOMRect(0, 50, 400, 400));
    const firstMessage = container.querySelector(
      'app-chat-message',
    ) as HTMLElement;
    firstMessage.getBoundingClientRect = vi.fn(
      () => new DOMRect(0, anchorDocumentTop - container.scrollTop, 400, 40),
    );
    component.onScrollUp();

    const olderMessage: IMessageEntity = {
      ...mockMessages[0],
      id: 'msg-older',
      createdAt: new Date('2026-09-14T00:00:00.000Z'),
    };

    setScroll(container, {
      scrollTop: 600,
      clientHeight: 400,
      scrollHeight: 1200,
    });
    anchorDocumentTop = 670;
    mockChatStore.messages.set([olderMessage, ...mockMessages]);
    fixture.detectChanges();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.scrollTop).toBe(600);
  });

  it('captures a visible message anchor and requests older messages on scroll up', () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector(
      '.scroll-container',
    ) as HTMLDivElement;
    setScroll(container, {
      scrollTop: 10,
      clientHeight: 400,
      scrollHeight: 950,
    });

    const firstMessage = container.querySelector(
      'app-chat-message',
    ) as HTMLElement;
    container.getBoundingClientRect = vi.fn(() => new DOMRect(0, 50, 400, 400));
    firstMessage.getBoundingClientRect = vi.fn(
      () => new DOMRect(0, 60, 400, 40),
    );

    component.onScrollUp();
    expect(component['prependAnchor']?.element).toBe(firstMessage);
    expect(mockChatStore.requestPrevPage).toHaveBeenCalled();
  });

  it('renders scroll button when showScrollToBottom is true', () => {
    component['showScrollToBottom'].set(true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.scroll-to-bottom button');
    expect(btn).toBeTruthy();
  });

  it('renders scroll button when hasMoreAfter is true even if showScrollToBottom is false', () => {
    component['showScrollToBottom'].set(false);
    mockChatStore.hasMoreAfter.set(true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.scroll-to-bottom button');
    expect(btn).toBeTruthy();
  });

  it('renders scroll button with unread count badge for the active room', () => {
    component['showScrollToBottom'].set(true);
    mockUnreadCountsStore.rooms.set({ 1: 5 });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.scroll-to-bottom button');
    expect(btn).toBeTruthy();
    const badge = fixture.nativeElement.querySelector('tui-badge-notification');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('5');
  });

  it('renders the active direct chat unread count', () => {
    component['showScrollToBottom'].set(true);
    mockChatStore.target.set({ kind: 'direct', id: 2 });
    mockUnreadCountsStore.direct.set({ 2: 4 });
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('tui-badge-notification');
    expect(badge?.textContent?.trim()).toBe('4');
  });

  it('does not render the unread badge when the active chat count is zero', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('tui-badge-notification'),
    ).toBeNull();
  });

  it('calls scrollToBottom smooth on button click when hasMoreAfter is false and unreadCount is 0', () => {
    component['showScrollToBottom'].set(true);
    mockChatStore.hasMoreAfter.set(false);
    fixture.detectChanges();

    const scrollSpy = vi.spyOn(component, 'scrollToBottom');
    const btn = fixture.nativeElement.querySelector(
      '.scroll-to-bottom button',
    ) as HTMLButtonElement;
    btn.click();

    expect(scrollSpy).toHaveBeenCalledWith('smooth');
    expect(mockChatStore.readAllAndJumpToLatest).not.toHaveBeenCalled();
  });

  it('reads all and scrolls to the bottom on button click when hasMoreAfter is true', () => {
    mockChatStore.hasMoreAfter.set(true);
    fixture.detectChanges();

    const scrollSpy = vi.spyOn(component, 'scrollToBottom');
    const btn = fixture.nativeElement.querySelector(
      '.scroll-to-bottom button',
    ) as HTMLButtonElement;
    btn.click();

    expect(mockChatStore.readAllAndJumpToLatest).toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenCalledWith('smooth');
  });

  it('calls readAllAndJumpToLatest on button click when unreadCount is positive', () => {
    mockChatStore.hasMoreAfter.set(false);
    component['showScrollToBottom'].set(true);
    mockUnreadCountsStore.rooms.set({ 1: 3 });
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '.scroll-to-bottom button',
    ) as HTMLButtonElement;
    btn.click();

    expect(mockChatStore.readAllAndJumpToLatest).toHaveBeenCalled();
  });

  it('scrolls to the replacement latest page after clicking while behind', async () => {
    mockChatStore.hasMoreAfter.set(true);
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector(
      '.scroll-container',
    ) as HTMLDivElement;
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 1200,
    });
    const scroll = vi.spyOn(container, 'scrollTo');

    const btn = fixture.nativeElement.querySelector(
      '.scroll-to-bottom button',
    ) as HTMLButtonElement;
    btn.click();
    mockChatStore.messages.set([
      ...mockMessages,
      {
        ...mockMessages[1],
        id: 'msg-latest',
        createdAt: new Date('2026-09-15T00:02:00.000Z'),
      },
    ]);
    fixture.detectChanges();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(scroll).toHaveBeenCalledWith({
      top: 1200,
      behavior: 'smooth',
    });
    expect(scroll).toHaveBeenCalledWith({
      top: 1200,
      behavior: 'instant',
    });
  });
});

function setScroll(
  element: HTMLElement,
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number },
): void {
  let currentScrollTop = metrics.scrollTop;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (val: number) => {
      currentScrollTop = val;
    },
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
