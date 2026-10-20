import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessagesListComponent } from './chat-messages-list.component';
import { provideStore } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { ChatStore, EMessageStatus, IMessageEntity } from '../chat.store';
import { UsersStore } from '@core/stores/users.store';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import { Sanitizer, computed, signal } from '@angular/core';
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
  let edgeObserverCallback: IntersectionObserverCallback;
  let edgeObserverOptions: IntersectionObserverInit | undefined;
  let observedElements: Element[] = [];

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

  const messagesSignal = signal<IMessageEntity[]>(mockMessages);
  const mockChatStore = {
    messages: messagesSignal,
    ids: computed(() =>
      messagesSignal().map((message: IMessageEntity) => message.id),
    ),
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
    loadingOlder: signal(false),
    loadingNewer: signal(false),
    scrollToLatestToken: signal(0),
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
    observedElements = [];
    messagesSignal.set(mockMessages);
    mockChatStore.targetScrollMessageId.set(null);
    mockChatStore.target.set({ kind: 'room', id: 1 });
    mockChatStore.unreadDividerMessageId.set(null);
    mockChatStore.initialPosition.set('bottom');
    mockChatStore.hasMoreAfter.set(false);
    mockChatStore.loadingOlder.set(false);
    mockChatStore.loadingNewer.set(false);
    mockChatStore.scrollToLatestToken.set(0);
    mockUnreadCountsStore.rooms.set({});
    mockUnreadCountsStore.direct.set({});
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();

    class MockIntersectionObserver {
      private readonly edge: boolean;

      observe = vi.fn((element: Element) => {
        if (this.edge) {
          observedElements.push(element);
        }
      });
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        this.edge = options?.rootMargin === '300px 0px';
        if (this.edge) {
          edgeObserverCallback = callback;
          edgeObserverOptions = options;
        }
      }
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

  it('configures edge observer with the scrollbar element as root', async () => {
    fixture.detectChanges();
    await flushAfterRender(fixture);
    const container = getScrollContainer(fixture);
    expect(edgeObserverOptions?.root).toBe(container);
    expect(edgeObserverOptions?.rootMargin).toBe('300px 0px');
  });

  it('does not request pages from sentinels while edge loading is disabled', () => {
    fixture.detectChanges();
    mockChatStore.requestPrevPage.mockClear();
    component['edgeLoadingEnabled'] = false;
    const topSentinel = observedElements[0];
    edgeObserverCallback(
      [
        {
          isIntersecting: true,
          target: topSentinel,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(mockChatStore.requestPrevPage).not.toHaveBeenCalled();
  });

  it('requests older messages when the top sentinel intersects after edge loading is enabled', async () => {
    fixture.detectChanges();
    component['applyInitialPosition']();
    await flushAfterRender(fixture);
    component['edgeLoadingEnabled'] = true;

    const topSentinel = observedElements[0];
    edgeObserverCallback(
      [
        {
          isIntersecting: true,
          target: topSentinel,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(mockChatStore.requestPrevPage).toHaveBeenCalled();
  });

  it('requests newer messages when the bottom sentinel intersects after edge loading is enabled', async () => {
    fixture.detectChanges();
    component['applyInitialPosition']();
    await flushAfterRender(fixture);
    component['edgeLoadingEnabled'] = true;

    const bottomSentinel = observedElements[1];
    edgeObserverCallback(
      [
        {
          isIntersecting: true,
          target: bottomSentinel,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(mockChatStore.requestNextPage).toHaveBeenCalled();
  });

  it('does not request an older page from the sentinel while loadingOlder is true', () => {
    fixture.detectChanges();
    mockChatStore.requestPrevPage.mockClear();
    component['edgeLoadingEnabled'] = true;
    mockChatStore.loadingOlder.set(true);

    const topSentinel = observedElements[0];
    edgeObserverCallback(
      [
        {
          isIntersecting: true,
          target: topSentinel,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    expect(mockChatStore.requestPrevPage).not.toHaveBeenCalled();
  });

  it('pins to the bottom when an outgoing message appears and not on later updates', async () => {
    fixture.detectChanges();
    await flushAfterRender(fixture);
    const container = getScrollContainer(fixture);
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 800,
    });

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
    messagesSignal.set([...mockMessages, outgoing]);
    TestBed.flushEffects();
    await flushAfterRender(fixture);
    expect(component['pinnedToBottom']).toBe(true);
    expect(container.scrollTop).toBe(800);

    messagesSignal.set([
      ...mockMessages,
      { ...outgoing, content: '<p>progress</p>' },
    ]);
    TestBed.flushEffects();
    await flushAfterRender(fixture);
    expect(container.scrollTop).toBe(800);
  });

  it('scrolls to the bottom when a new message arrives while already at the bottom', async () => {
    fixture.detectChanges();
    const container = getScrollContainer(fixture);
    setScroll(container, {
      scrollTop: 400,
      clientHeight: 400,
      scrollHeight: 800,
    });
    container.dispatchEvent(new Event('scroll'));

    messagesSignal.set([
      ...mockMessages,
      {
        ...mockMessages[0],
        id: 'msg-3',
        content: '<p>Third</p>',
        createdAt: new Date('2026-09-15T00:02:00.000Z'),
      },
    ]);
    TestBed.flushEffects();
    await flushAfterRender(fixture);
    expect(container.scrollTop).toBe(800);
  });

  it('keeps the scroll position when a new message arrives above the bottom', async () => {
    fixture.detectChanges();
    const container = getScrollContainer(fixture);
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 1200,
    });
    container.dispatchEvent(new Event('scroll'));

    messagesSignal.set([
      ...mockMessages,
      {
        ...mockMessages[0],
        id: 'msg-3',
        content: '<p>Third</p>',
        createdAt: new Date('2026-09-15T00:02:00.000Z'),
      },
    ]);
    TestBed.flushEffects();
    await flushAfterRender(fixture);
    expect(container.scrollTop).toBe(0);
  });

  it('should render unread divider item before message matching unreadDividerMessageId', () => {
    mockChatStore.unreadDividerMessageId.set('msg-2');
    fixture.detectChanges();

    const divider = fixture.nativeElement.querySelector('#unread-divider');
    expect(divider).toBeTruthy();

    const children = Array.from(
      fixture.nativeElement.querySelector('.messages')?.children ?? [],
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
    await flushAfterRender(fixture);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'start',
    });
    expect(component['pinnedToBottom']).toBe(false);
  });

  it('falls back to the bottom when initialPosition is unread but divider element is absent', async () => {
    mockChatStore.unreadDividerMessageId.set(null);
    mockChatStore.initialPosition.set('unread');
    fixture.detectChanges();
    const container = getScrollContainer(fixture);
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 900,
    });

    component['applyInitialPosition']();
    await flushAfterRender(fixture);

    expect(container.scrollTop).toBe(900);
    expect(component['pinnedToBottom']).toBe(true);
  });

  it('scrolls to the bottom when initialPosition is bottom', async () => {
    mockChatStore.initialPosition.set('bottom');
    fixture.detectChanges();
    const container = getScrollContainer(fixture);
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 900,
    });

    component['applyInitialPosition']();
    await flushAfterRender(fixture);

    expect(container.scrollTop).toBe(900);
    expect(component['pinnedToBottom']).toBe(true);
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
    await flushAfterRender(fixture);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'center',
    });
    expect(mockChatStore.setTargetScrollMessageId).toHaveBeenCalledWith(null);
    expect(component['pinnedToBottom']).toBe(false);
  });

  it('adjusts scrollTop when the visible anchor message moves down in the viewport', () => {
    fixture.detectChanges();
    const container = getScrollContainer(fixture);
    const anchor = container.querySelector('app-chat-message') as HTMLElement;
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 800,
    });
    container.getBoundingClientRect = vi.fn(() => new DOMRect(0, 50, 400, 400));
    anchor.getBoundingClientRect = vi.fn(() => new DOMRect(0, 470, 400, 40));

    component['restoreAnchor']({ messageId: 'msg-1', offset: 20 });

    expect(container.scrollTop).toBe(400);
  });

  it.each([
    {
      name: 'older page is prepended',
      older: true,
      live: false,
      loadingOlder: false,
      preservedByBrowser: false,
      anchorVisible: true,
      expected: 500,
    },
    {
      name: 'older page is prepended while a live message arrives at the tail',
      older: true,
      live: true,
      loadingOlder: false,
      preservedByBrowser: false,
      anchorVisible: true,
      expected: 500,
    },
    {
      name: 'top skeleton appears',
      older: false,
      live: false,
      loadingOlder: true,
      preservedByBrowser: false,
      anchorVisible: true,
      expected: 256,
    },
    {
      name: 'only a live message arrives at the tail',
      older: false,
      live: true,
      loadingOlder: false,
      preservedByBrowser: false,
      anchorVisible: true,
      expected: 200,
    },
    {
      name: 'the browser already preserved the anchor offset',
      older: true,
      live: false,
      loadingOlder: false,
      preservedByBrowser: true,
      anchorVisible: true,
      expected: 200,
    },
    {
      name: 'no message is visible and the top skeleton appears',
      older: false,
      live: false,
      loadingOlder: true,
      preservedByBrowser: false,
      anchorVisible: false,
      expected: 256,
    },
  ])(
    'keeps the visible content in place when $name',
    async ({
      older,
      live,
      loadingOlder,
      preservedByBrowser,
      anchorVisible,
      expected,
    }) => {
      const olderHeight = 300;
      const liveHeight = 100;
      const skeletonHeight = 56;
      const baseScrollHeight = 1200;

      fixture.detectChanges();
      await flushAfterRender(fixture);
      const container = getScrollContainer(fixture);
      setScroll(container, {
        scrollTop: 200,
        clientHeight: 400,
        scrollHeight: baseScrollHeight,
      });
      container.dispatchEvent(new Event('scroll'));
      component['previousFirstMessageId'] = 'msg-1';
      container.getBoundingClientRect = vi.fn(
        () => new DOMRect(0, 50, 400, 400),
      );

      // Layout is derived from the rendered DOM, so the values change between
      // the snapshot taken before render and the write after render.
      const hasInDom = (selector: string): boolean =>
        container.querySelector(selector) !== null;
      const topGrowth = (): number =>
        (hasInDom('[data-message-id="msg-older"]') ? olderHeight : 0) +
        (hasInDom('.skeleton-row') ? skeletonHeight : 0);
      Object.defineProperty(container, 'scrollHeight', {
        configurable: true,
        get: () =>
          baseScrollHeight +
          topGrowth() +
          (hasInDom('[data-message-id="msg-live"]') ? liveHeight : 0),
      });

      const anchor = container.querySelector('app-chat-message') as HTMLElement;
      anchor.setAttribute('data-message-id', 'msg-1');
      anchor.getBoundingClientRect = vi.fn(
        () =>
          new DOMRect(
            0,
            (anchorVisible ? 120 : -100) +
              (preservedByBrowser ? 0 : topGrowth()),
            400,
            40,
          ),
      );

      const olderMessage: IMessageEntity = {
        ...mockMessages[0],
        id: 'msg-older',
        createdAt: new Date('2026-09-14T00:00:00.000Z'),
      };
      const liveMessage: IMessageEntity = {
        ...mockMessages[1],
        id: 'msg-live',
        createdAt: new Date('2026-09-16T00:00:00.000Z'),
      };
      messagesSignal.set([
        ...(older ? [olderMessage] : []),
        ...mockMessages,
        ...(live ? [liveMessage] : []),
      ]);
      mockChatStore.loadingOlder.set(loadingOlder);
      await flushAfterRender(fixture);

      expect(container.scrollTop).toBe(expected);
    },
  );

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

  it('reads all on button click when hasMoreAfter is true without scrolling immediately', () => {
    mockChatStore.hasMoreAfter.set(true);
    fixture.detectChanges();

    const scrollSpy = vi.spyOn(component, 'scrollToBottom');
    const btn = fixture.nativeElement.querySelector(
      '.scroll-to-bottom button',
    ) as HTMLButtonElement;
    btn.click();

    expect(mockChatStore.readAllAndJumpToLatest).toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
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

  it('scrolls to the replacement latest page after the scroll-to-latest token changes', async () => {
    mockChatStore.hasMoreAfter.set(true);
    fixture.detectChanges();
    const container = getScrollContainer(fixture);
    setScroll(container, {
      scrollTop: 0,
      clientHeight: 400,
      scrollHeight: 1200,
    });
    const scrollTo = vi.spyOn(container, 'scrollTo');

    const btn = fixture.nativeElement.querySelector(
      '.scroll-to-bottom button',
    ) as HTMLButtonElement;
    btn.click();
    expect(scrollTo).not.toHaveBeenCalled();

    messagesSignal.set([
      ...mockMessages,
      {
        ...mockMessages[1],
        id: 'msg-latest',
        createdAt: new Date('2026-09-15T00:02:00.000Z'),
      },
    ]);
    mockChatStore.scrollToLatestToken.set(1);
    TestBed.flushEffects();
    await flushAfterRender(fixture);

    expect(container.scrollTop).toBe(1200);
    expect(component['pinnedToBottom']).toBe(true);
  });
});

function getScrollContainer(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement.querySelector(
    'tui-scrollbar.scroll-container',
  ) as HTMLElement;
}

async function flushAfterRender(
  fixture: ComponentFixture<unknown>,
): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  TestBed.flushEffects();
  fixture.detectChanges();
  await fixture.whenStable();
}

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
