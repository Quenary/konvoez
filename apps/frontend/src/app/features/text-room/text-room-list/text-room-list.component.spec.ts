import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomListComponent } from './text-room-list.component';
import { provideStore } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import {
  TextRoomStore,
  EMessageStatus,
  IMessageEntity,
} from '../text-room.store';
import { UsersStore } from '@features/users/users.store';
import { TuiNotificationService } from '@taiga-ui/core';
import { Sanitizer, signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authReducer } from '@features/auth/auth.reducer';

describe('TextRoomListComponent', () => {
  let component: TextRoomListComponent;
  let fixture: ComponentFixture<TextRoomListComponent>;

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

  const mockTextRoomStore = {
    messages: signal<IMessageEntity[]>(mockMessages),
    targetScrollMessageId: signal<string | null>(null),
    setTargetScrollMessageId: vi.fn(),
    requestPrevPage: vi.fn(),
    requestNextPage: vi.fn(),
    selectedRoomId: signal(1),
    selectedRecipientId: signal(null),
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
    mockTextRoomStore.messages.set(mockMessages);
    mockTextRoomStore.targetScrollMessageId.set(null);
    Element.prototype.scrollTo = vi.fn();

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
      imports: [TextRoomListComponent],
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
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn(() => of(undefined)) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TextRoomListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call requestPrevPage on onScrollUp', () => {
    component.onScrollUp();
    expect(mockTextRoomStore.requestPrevPage).toHaveBeenCalled();
  });

  it('should call requestNextPage on onScrolled', () => {
    component.onScrolled();
    expect(mockTextRoomStore.requestNextPage).toHaveBeenCalled();
  });
});
