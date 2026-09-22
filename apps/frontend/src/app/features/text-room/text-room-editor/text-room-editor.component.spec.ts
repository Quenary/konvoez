import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomEditorComponent } from './text-room-editor.component';
import { provideTranslateService } from '@ngx-translate/core';
import {
  TextRoomStore,
  EMessageStatus,
  IMessageEntity,
} from '../text-room.store';
import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';
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

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTextRoomStore.editableMessage.set(null);
    mockTextRoomStore.replyToMessage.set(null);

    await TestBed.configureTestingModule({
      imports: [TextRoomEditorComponent],
      providers: [
        provideTranslateService(),
        { provide: TextRoomStore, useValue: mockTextRoomStore },
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
    (component as unknown as { cancelReply: () => void }).cancelReply();
    expect(mockTextRoomStore.setReplyToMessageId).toHaveBeenCalledWith(null);
  });

  it('should cancel edit', () => {
    (component as unknown as { cancelEdit: () => void }).cancelEdit();
    expect(mockTextRoomStore.setEditableMessageId).toHaveBeenCalledWith(null);
  });

  it('should not submit empty message', () => {
    const control = (component as unknown as { control: FormControl }).control;
    control.setValue('');
    (component as unknown as { onSubmit: () => void }).onSubmit();
    expect(mockTextRoomStore.createMessage).not.toHaveBeenCalled();

    control.setValue('<p></p>');
    (component as unknown as { onSubmit: () => void }).onSubmit();
    expect(mockTextRoomStore.createMessage).not.toHaveBeenCalled();
  });

  it('should create message with replyToId when replyToMessage is active', () => {
    mockTextRoomStore.replyToMessage.set(mockReplyMessage);
    const control = (component as unknown as { control: FormControl }).control;
    control.setValue('<p>This is a reply</p>');

    (component as unknown as { onSubmit: () => void }).onSubmit();

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
    const control = (component as unknown as { control: FormControl }).control;
    control.setValue('<p>Edited content</p>');

    (component as unknown as { onSubmit: () => void }).onSubmit();

    expect(mockTextRoomStore.updateMessage).toHaveBeenCalledWith({
      messageId: 'reply-target-1',
      data: { content: '<p>Edited content</p>' },
    });
    expect(control.value).toBe('');
  });
});
