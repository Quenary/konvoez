import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomEditorComponent } from './text-room-editor.component';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import {
  TextRoomStore,
  EMessageStatus,
  IMessageEntity,
} from '../text-room.store';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('TextRoomEditorComponent', () => {
  let component: TextRoomEditorComponent;
  let fixture: ComponentFixture<TextRoomEditorComponent>;

  const mockReplyMessage: IMessageEntity = {
    id: 'reply-target-1',
    content: '<p>Original</p>',
    senderId: 2,
    senderUsername: 'bob',
    roomId: 1,
    recipientId: null,
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: null,
    isRead: false,
    status: EMessageStatus.SUCCESS,
    replyTo: null,
  };

  const mockTextRoomStore = {
    editableMessage: signal<IMessageEntity | null>(null),
    replyToMessage: signal<IMessageEntity | null>(null),
    selectedRoomId: signal<number | null>(1),
    selectedRecipientId: signal<number | null>(null),
    createMessage: vi.fn(),
    updateMessage: vi.fn(),
    setEditableMessageId: vi.fn(),
    setReplyToMessageId: vi.fn(),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTextRoomStore.editableMessage.set(null);
    mockTextRoomStore.replyToMessage.set(null);

    await TestBed.configureTestingModule({
      imports: [TextRoomEditorComponent],
      providers: [
        provideTranslateService(),
        { provide: TextRoomStore, useValue: mockTextRoomStore },
        { provide: TuiNotificationService, useValue: mockNotificationService },
      ],
    })
      .overrideComponent(TextRoomEditorComponent, {
        set: {
          template: '',
          providers: [],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TextRoomEditorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should cancel reply', () => {
    component['cancelReply']();
    expect(mockTextRoomStore.setReplyToMessageId).toHaveBeenCalledWith(null);
  });

  it('should cancel edit', () => {
    component['cancelEdit']();
    expect(mockTextRoomStore.setEditableMessageId).toHaveBeenCalledWith(null);
  });

  it('should not attach a validator to the control and should notify on submit validation failure', () => {
    const control = component['control'];

    expect(control.validator).toBeNull();

    control.setValue('');
    component['onSubmit']();

    expect(control.touched).toBe(true);
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'VALIDATION.MESSAGE_LENGTH',
      expect.objectContaining({
        appearance: 'negative',
      }),
    );
    expect(mockTextRoomStore.createMessage).not.toHaveBeenCalled();

    mockNotificationService.open.mockClear();
    control.setValue('<p></p>');
    component['onSubmit']();
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'VALIDATION.MESSAGE_LENGTH',
      expect.objectContaining({
        appearance: 'negative',
      }),
    );
    expect(mockTextRoomStore.createMessage).not.toHaveBeenCalled();
  });

  it('should create message with replyToId when replyToMessage is active', () => {
    mockTextRoomStore.replyToMessage.set(mockReplyMessage);
    const control = component['control'];
    control.setValue('<p>This is a reply</p>');

    component['onSubmit']();

    expect(mockTextRoomStore.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '<p>This is a reply</p>',
          roomId: 1,
          recipientId: null,
          replyToId: 'reply-target-1',
        }),
      }),
    );
    expect(control.value).toBe('');
  });

  it('should update message when editableMessage is active', () => {
    mockTextRoomStore.editableMessage.set(mockReplyMessage);
    const control = component['control'];
    control.setValue('<p>Edited content</p>');

    component['onSubmit']();

    expect(mockTextRoomStore.updateMessage).toHaveBeenCalledWith({
      messageId: 'reply-target-1',
      data: { content: '<p>Edited content</p>' },
    });
    expect(control.value).toBe('');
  });
});
