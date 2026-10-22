import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessagesListComponent } from './chat-messages-list.component';
import { provideStore } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { ChatStore, EMessageStatus, IMessageEntity } from '../chat.store';
import { UsersStore } from '@core/stores/users.store';
import { TuiNotificationService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import { Sanitizer, Signal, computed, signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { authReducer } from '@core/auth/auth.reducer';
import { ChatApiService } from '@core/api/chat-api.service';
import { MessageReadQueueService } from '@core/chat/message-read-queue.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { ChatTarget } from '../chat-target';
import { AuthActions } from '@core/auth/auth.actions';
import { Store } from '@ngrx/store';
import {
  CHAT_VIRTUALIZER_FACTORY,
  ChatVirtualizerFactory,
} from './chat-virtualizer';

type FakeOptions = {
  count: number;
  getItemKey: (index: number) => string | number;
};

/** Layout-free stand-in for the TanStack virtualizer. */
function createFakeVirtualizer() {
  let options: () => FakeOptions = () => ({ count: 0, getItemKey: (i) => i });
  const fake = {
    range: signal<{ startIndex: number; endIndex: number } | null>(null),
    isScrolling: signal(false),
    scrollOffset: signal(0),
    getTotalSize: signal(0),
    scrollRect: signal<{ width: number; height: number } | null>(null),
    atEnd: true,
    isAtEnd: vi.fn((): boolean => fake.atEnd),
    scrollToIndex: vi.fn(),
    scrollToEnd: vi.fn(),
    measureElement: vi.fn(),
    getVirtualItems: null as unknown as Signal<
      { index: number; key: string | number; start: number }[]
    >,
  };
  const factory = ((opts: () => FakeOptions) => {
    options = opts;
    fake.getVirtualItems = computed(() => {
      const current = options();
      return Array.from({ length: current.count }, (_, index) => ({
        index,
        key: current.getItemKey(index),
        start: index * 50,
      }));
    });
    return fake;
  }) as unknown as ChatVirtualizerFactory;
  return { fake, factory, options: () => options() };
}

describe('ChatMessagesListComponent', () => {
  let component: ChatMessagesListComponent;
  let fixture: ComponentFixture<ChatMessagesListComponent>;
  let virtualizer: ReturnType<typeof createFakeVirtualizer>;
  let readQueue: {
    enqueue: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };
  let visibilityCallbacks: Map<Element, IntersectionObserverCallback>;

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
    hasMoreBefore: signal<boolean>(false),
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.clearAllMocks();
    messagesSignal.set(mockMessages);
    mockChatStore.targetScrollMessageId.set(null);
    mockChatStore.target.set({ kind: 'room', id: 1 });
    mockChatStore.unreadDividerMessageId.set(null);
    mockChatStore.initialPosition.set('bottom');
    mockChatStore.hasMoreAfter.set(false);
    mockChatStore.hasMoreBefore.set(false);
    mockChatStore.loadingOlder.set(false);
    mockChatStore.loadingNewer.set(false);
    mockChatStore.scrollToLatestToken.set(0);
    mockUnreadCountsStore.rooms.set({});
    mockUnreadCountsStore.direct.set({});
    virtualizer = createFakeVirtualizer();
    readQueue = { enqueue: vi.fn(), reset: vi.fn() };
    visibilityCallbacks = new Map();

    class MockIntersectionObserver {
      private readonly callback: IntersectionObserverCallback;
      observe = vi.fn((element: Element) => {
        visibilityCallbacks.set(element, this.callback);
      });
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
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
        { provide: MessageReadQueueService, useValue: readQueue },
        {
          provide: OutgoingMessagesStore,
          useValue: { uploadProgress: signal({}) },
        },
        {
          provide: TuiResponsiveDialogService,
          useValue: { open: vi.fn(() => of(undefined)) },
        },
        { provide: CHAT_VIRTUALIZER_FACTORY, useValue: virtualizer.factory },
      ],
    }).compileComponents();

    TestBed.inject(Store).dispatch(
      AuthActions.initEnd({ user: { id: 1, username: 'alice' } as never }),
    );
    fixture = TestBed.createComponent(ChatMessagesListComponent);
    component = fixture.componentInstance;
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    await fixture.whenStable();
  }

  /** Lets a programmatic jump that did not scroll finish via its fallback. */
  async function finishJump(): Promise<void> {
    vi.advanceTimersByTime(600);
    await settle();
  }

  function rowKeys(): (string | number)[] {
    return virtualizer.fake.getVirtualItems().map((item) => item.key);
  }

  function setVisible(messageId: string, visible: boolean): void {
    const host = fixture.nativeElement
      .querySelector(`[id="message-${messageId}"]`)
      ?.closest('app-chat-message') as Element | null;
    const callback = host ? visibilityCallbacks.get(host) : undefined;
    expect(callback).toBeTruthy();
    callback?.(
      [
        {
          isIntersecting: visible,
          intersectionRatio: visible ? 1 : 0,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('rows', () => {
    it('keys message rows by client id and inserts the divider and skeletons', async () => {
      mockChatStore.unreadDividerMessageId.set('msg-2');
      mockChatStore.loadingOlder.set(true);
      mockChatStore.loadingNewer.set(true);
      await settle();

      expect(rowKeys()).toEqual([
        'skel-top',
        'msg:msg-1',
        'divider',
        'msg:msg-2',
        'skel-bottom',
      ]);
      expect(
        fixture.nativeElement.querySelectorAll('.skeleton-row'),
      ).toHaveLength(2);
      expect(
        fixture.nativeElement.querySelector('#unread-divider'),
      ).toBeTruthy();
    });

    it('hands every rendered row to the virtualizer for measurement', () => {
      expect(virtualizer.fake.measureElement).toHaveBeenCalledTimes(2);
    });
  });

  describe('initial position', () => {
    it('scrolls to the end for the bottom position', () => {
      expect(virtualizer.fake.scrollToEnd).toHaveBeenCalled();
    });

    it('scrolls the unread divider to the top for the unread position', async () => {
      fixture.destroy();
      vi.clearAllMocks();
      mockChatStore.initialPosition.set('unread');
      mockChatStore.unreadDividerMessageId.set('msg-2');
      fixture = TestBed.createComponent(ChatMessagesListComponent);
      await settle();

      expect(virtualizer.fake.scrollToIndex).toHaveBeenCalledWith(1, {
        align: 'start',
      });
      expect(virtualizer.fake.scrollToEnd).not.toHaveBeenCalled();
    });

    it('centers the target message for the message position and clears it', async () => {
      fixture.destroy();
      vi.clearAllMocks();
      mockChatStore.initialPosition.set('message');
      mockChatStore.targetScrollMessageId.set('msg-2');
      fixture = TestBed.createComponent(ChatMessagesListComponent);
      await settle();

      expect(virtualizer.fake.scrollToIndex).toHaveBeenCalledWith(1, {
        align: 'center',
        behavior: 'auto',
      });
      expect(mockChatStore.setTargetScrollMessageId).toHaveBeenCalledWith(null);
    });

    it('falls back to the end when the unread divider is absent', async () => {
      fixture.destroy();
      vi.clearAllMocks();
      mockChatStore.initialPosition.set('unread');
      fixture = TestBed.createComponent(ChatMessagesListComponent);
      await settle();

      expect(virtualizer.fake.scrollToIndex).not.toHaveBeenCalled();
      expect(virtualizer.fake.scrollToEnd).toHaveBeenCalled();
    });
  });

  describe('edge prefetch', () => {
    /** Viewport 500 px, content 5000 px: the prefetch zone is 1250 px. */
    async function scrollTo(offset: number): Promise<void> {
      virtualizer.fake.scrollRect.set({ width: 600, height: 500 });
      virtualizer.fake.getTotalSize.set(5000);
      virtualizer.fake.scrollOffset.set(offset);
      await settle();
    }

    it('does not request pages before the initial jump settles', async () => {
      mockChatStore.hasMoreBefore.set(true);
      await scrollTo(0);

      expect(mockChatStore.requestPrevPage).not.toHaveBeenCalled();
    });

    it('requests older messages within 2.5 viewports of the top', async () => {
      await finishJump();
      mockChatStore.hasMoreBefore.set(true);
      await scrollTo(1200);

      expect(mockChatStore.requestPrevPage).toHaveBeenCalledTimes(1);
    });

    it('requests newer messages within 2.5 viewports of the bottom', async () => {
      await finishJump();
      mockChatStore.hasMoreAfter.set(true);
      await scrollTo(3300);

      expect(mockChatStore.requestNextPage).toHaveBeenCalledTimes(1);
    });

    it('does not request pages in the middle of the history', async () => {
      await finishJump();
      mockChatStore.hasMoreBefore.set(true);
      mockChatStore.hasMoreAfter.set(true);
      await scrollTo(2500);

      expect(mockChatStore.requestPrevPage).not.toHaveBeenCalled();
      expect(mockChatStore.requestNextPage).not.toHaveBeenCalled();
    });

    it('waits for a loading page and requests again while still close', async () => {
      await finishJump();
      mockChatStore.loadingOlder.set(true);
      mockChatStore.hasMoreBefore.set(true);
      await scrollTo(100);
      expect(mockChatStore.requestPrevPage).not.toHaveBeenCalled();

      mockChatStore.loadingOlder.set(false);
      await settle();
      expect(mockChatStore.requestPrevPage).toHaveBeenCalledTimes(1);

      mockChatStore.loadingOlder.set(true);
      await settle();
      mockChatStore.loadingOlder.set(false);
      await settle();
      expect(mockChatStore.requestPrevPage).toHaveBeenCalledTimes(2);
    });
  });

  describe('following the end', () => {
    it('scrolls to the end when an own outgoing message appears', async () => {
      virtualizer.fake.scrollToEnd.mockClear();
      messagesSignal.set([
        ...mockMessages,
        {
          ...mockMessages[0],
          id: 'temp-1',
          clientId: 'temp-1',
          createdAt: new Date('2026-09-15T00:05:00.000Z'),
          outgoing: {
            tempId: 'temp-1',
            data: {
              roomId: 1,
              recipientId: null,
              content: '',
              attachmentIds: [],
            },
            replyTo: null,
            createdAt: new Date('2026-09-15T00:05:00.000Z'),
            files: [],
            state: { phase: 'creating' },
          },
        },
      ]);
      await settle();

      expect(virtualizer.fake.scrollToEnd).toHaveBeenCalledTimes(1);
    });

    it('scrolls to the end after the scroll-to-latest token changes', async () => {
      virtualizer.fake.scrollToEnd.mockClear();
      mockChatStore.scrollToLatestToken.set(1);
      await settle();

      expect(virtualizer.fake.scrollToEnd).toHaveBeenCalledTimes(1);
    });

    it('jumps to a message requested after positioning', async () => {
      await finishJump();
      mockChatStore.targetScrollMessageId.set('msg-1');
      await settle();

      expect(virtualizer.fake.scrollToIndex).toHaveBeenCalledWith(0, {
        align: 'center',
        behavior: 'smooth',
      });
    });
  });

  describe('mark-read', () => {
    it('enqueues a visible incoming unread message once scrolling settled', async () => {
      await finishJump();
      setVisible('msg-2', true);

      expect(readQueue.enqueue).toHaveBeenCalledWith('msg-2');
    });

    it('does not enqueue own, read or pending messages', async () => {
      messagesSignal.set([
        { ...mockMessages[0], senderId: 1 },
        { ...mockMessages[1], isRead: true },
      ]);
      await finishJump();
      setVisible('msg-1', true);
      setVisible('msg-2', true);

      expect(readQueue.enqueue).not.toHaveBeenCalled();
    });

    it('holds visible messages during a programmatic jump and flushes them after it', async () => {
      setVisible('msg-2', true);
      expect(readQueue.enqueue).not.toHaveBeenCalled();

      await finishJump();

      expect(readQueue.enqueue).toHaveBeenCalledWith('msg-2');
    });

    it('holds visible messages while the user scrolls and sends only those still visible', async () => {
      await finishJump();
      virtualizer.fake.isScrolling.set(true);
      await settle();
      setVisible('msg-1', true);
      setVisible('msg-2', true);
      setVisible('msg-1', false);
      expect(readQueue.enqueue).not.toHaveBeenCalled();

      virtualizer.fake.isScrolling.set(false);
      await settle();

      expect(readQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(readQueue.enqueue).toHaveBeenCalledWith('msg-2');
    });

    it('forgets messages whose rows are no longer rendered', async () => {
      await finishJump();
      virtualizer.fake.isScrolling.set(true);
      await settle();
      setVisible('msg-2', true);
      messagesSignal.set([mockMessages[0]]);
      await settle();

      virtualizer.fake.isScrolling.set(false);
      await settle();

      expect(readQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('scroll-to-bottom button', () => {
    function button(): HTMLButtonElement | null {
      return fixture.nativeElement.querySelector('.scroll-to-bottom button');
    }

    async function scrollAway(): Promise<void> {
      virtualizer.fake.atEnd = false;
      virtualizer.fake.scrollOffset.set(100);
      await settle();
    }

    it('is hidden at the end without newer pages', () => {
      expect(button()).toBeNull();
    });

    it('shows when far from the end', async () => {
      await scrollAway();

      expect(button()).toBeTruthy();
      expect(virtualizer.fake.isAtEnd).toHaveBeenCalledWith(200);
    });

    it('shows when newer pages exist', async () => {
      mockChatStore.hasMoreAfter.set(true);
      await settle();

      expect(button()).toBeTruthy();
    });

    it('shows the unread count of the active room', async () => {
      await scrollAway();
      mockUnreadCountsStore.rooms.set({ 1: 5 });
      await settle();

      const badge = fixture.nativeElement.querySelector(
        'tui-badge-notification',
      );
      expect(badge?.textContent?.trim()).toBe('5');
    });

    it('shows the unread count of the active direct chat', async () => {
      await scrollAway();
      mockChatStore.target.set({ kind: 'direct', id: 2 });
      mockUnreadCountsStore.direct.set({ 2: 4 });
      await settle();

      const badge = fixture.nativeElement.querySelector(
        'tui-badge-notification',
      );
      expect(badge?.textContent?.trim()).toBe('4');
    });

    it('caps the badge at 99+', async () => {
      await scrollAway();
      mockUnreadCountsStore.rooms.set({ 1: 150 });
      await settle();

      expect(
        fixture.nativeElement
          .querySelector('tui-badge-notification')
          ?.textContent?.trim(),
      ).toBe('99+');
    });

    it('scrolls smoothly to the end when everything is loaded and read', async () => {
      await scrollAway();
      virtualizer.fake.scrollToEnd.mockClear();
      button()?.click();
      await settle();

      expect(virtualizer.fake.scrollToEnd).toHaveBeenCalledWith({
        behavior: 'smooth',
      });
      expect(mockChatStore.readAllAndJumpToLatest).not.toHaveBeenCalled();
    });

    it('reads all and loads the latest page when newer pages exist', async () => {
      mockChatStore.hasMoreAfter.set(true);
      await settle();
      virtualizer.fake.scrollToEnd.mockClear();
      button()?.click();
      await settle();

      expect(mockChatStore.readAllAndJumpToLatest).toHaveBeenCalled();
      expect(virtualizer.fake.scrollToEnd).not.toHaveBeenCalled();
    });

    it('reads all when there are unread messages', async () => {
      await scrollAway();
      mockUnreadCountsStore.rooms.set({ 1: 3 });
      await settle();
      button()?.click();

      expect(mockChatStore.readAllAndJumpToLatest).toHaveBeenCalled();
    });
  });
});
