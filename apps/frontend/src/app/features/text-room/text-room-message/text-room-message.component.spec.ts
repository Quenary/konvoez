import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomMessageComponent } from './text-room-message.component';
import { provideStore } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TextRoomStore, EMessageStatus, IMessageEntity } from '../text-room.store';
import { UsersStore } from '@features/users/users.store';
import { TuiNotificationService } from '@taiga-ui/core';
import { signal, Sanitizer } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authReducer } from '@features/auth/auth.reducer';

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

  const testMessage: IMessageEntity = {
    id: 'msg-1',
    content: '<p>Hello world</p>',
    senderId: 1,
    senderUsername: 'alice',
    roomId: 1,
    recipientId: null,
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: null,
    status: EMessageStatus.SUCCESS,
    replyTo: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

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
    expect((component as unknown as { sanitizedContent: () => string }).sanitizedContent()).toBeTruthy();
  });

  it('should set reply target when replyMessage is called', () => {
    (component as unknown as { replyMessage: () => void }).replyMessage();
    expect(mockTextRoomStore.setReplyToMessageId).toHaveBeenCalledWith('msg-1');
  });

  it('should set editable message when editMessage is called', () => {
    (component as unknown as { editMessage: () => void }).editMessage();
    expect(mockTextRoomStore.setEditableMessageId).toHaveBeenCalledWith('msg-1');
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
    (component as unknown as { onReplyQuoteClick: (r: typeof reply) => void }).onReplyQuoteClick(reply);
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
    (component as unknown as { onReplyQuoteClick: (r: typeof reply) => void }).onReplyQuoteClick(reply);
    expect(mockNotificationService.open).toHaveBeenCalled();
    expect(mockTextRoomStore.jumpToMessage).not.toHaveBeenCalled();
  });
});
