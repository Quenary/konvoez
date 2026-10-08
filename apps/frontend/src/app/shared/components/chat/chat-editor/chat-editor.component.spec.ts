import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatEditorComponent } from './chat-editor.component';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { ChatStore, EMessageStatus, IMessageEntity } from '../chat.store';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsStore } from '@core/stores/settings.store';
import { EAttachmentKind, IAttachment } from '@konvoez/shared';
import { createLocalFile } from '@core/chat/outgoing/outgoing.types';

describe('ChatEditorComponent', () => {
  let component: ChatEditorComponent;
  let fixture: ComponentFixture<ChatEditorComponent>;

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
    attachments: [],
    clientId: null,
    status: EMessageStatus.SUCCESS,
    replyTo: null,
  };

  const mockChatStore = {
    editableMessage: signal<IMessageEntity | null>(null),
    replyToMessage: signal<IMessageEntity | null>(null),
    target: signal<{ kind: 'room'; id: number } | null>({
      kind: 'room',
      id: 1,
    }),
    createMessage: vi.fn(),
    updateMessage: vi.fn(),
    setEditableMessageId: vi.fn(),
    setReplyToMessageId: vi.fn(),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
  };

  const mockSettingsStore = {
    attachmentsEnabled: signal(true),
    attachmentsMaxFileSize: signal(50 * 1024 * 1024),
    attachmentsMaxFilesPerMessage: signal(10),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockChatStore.editableMessage.set(null);
    mockChatStore.replyToMessage.set(null);

    await TestBed.configureTestingModule({
      imports: [ChatEditorComponent],
      providers: [
        provideTranslateService(),
        { provide: ChatStore, useValue: mockChatStore },
        { provide: SettingsStore, useValue: mockSettingsStore },
        { provide: TuiNotificationService, useValue: mockNotificationService },
      ],
    })
      .overrideComponent(ChatEditorComponent, {
        set: {
          template: '',
          providers: [],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatEditorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should cancel reply', () => {
    component['cancelReply']();
    expect(mockChatStore.setReplyToMessageId).toHaveBeenCalledWith(null);
  });

  it('should cancel edit', () => {
    component['cancelEdit']();
    expect(mockChatStore.setEditableMessageId).toHaveBeenCalledWith(null);
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
    expect(mockChatStore.createMessage).not.toHaveBeenCalled();

    mockNotificationService.open.mockClear();
    control.setValue('<p></p>');
    component['onSubmit']();
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'VALIDATION.MESSAGE_LENGTH',
      expect.objectContaining({
        appearance: 'negative',
      }),
    );
    expect(mockChatStore.createMessage).not.toHaveBeenCalled();
  });

  it('should create message with replyToId when replyToMessage is active', () => {
    mockChatStore.replyToMessage.set(mockReplyMessage);
    const control = component['control'];
    control.setValue('<p>This is a reply</p>');

    component['onSubmit']();

    expect(mockChatStore.createMessage).toHaveBeenCalledWith(
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
    mockChatStore.editableMessage.set(mockReplyMessage);
    const control = component['control'];
    control.setValue('<p>Edited content</p>');

    component['onSubmit']();

    expect(mockChatStore.updateMessage).toHaveBeenCalledWith({
      messageId: 'reply-target-1',
      data: { content: '<p>Edited content</p>' },
    });
    expect(control.value).toBe('');
  });

  it('should send a files-only message and keep object urls for the outgoing store', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const file = new File(['hi'], 'note.txt', { type: 'text/plain' });
    component.addFiles([file]);
    component['onSubmit']();
    expect(mockChatStore.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: '' }),
        files: [
          expect.objectContaining({
            kind: EAttachmentKind.FILE,
            previewUrl: null,
          }),
        ],
      }),
    );
    expect(component['files']()).toEqual([]);
    expect(revoke).not.toHaveBeenCalled();
    revoke.mockRestore();
  });

  it('should reject an oversize file and a pick past the file limit', () => {
    mockSettingsStore.attachmentsMaxFileSize.set(4);
    mockSettingsStore.attachmentsMaxFilesPerMessage.set(1);
    component.addFiles([
      new File(['12345'], 'big.txt', { type: 'text/plain' }),
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ]);
    expect(component['files']()).toHaveLength(1);
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'VALIDATION.FILE_TOO_BIG',
      expect.objectContaining({ appearance: 'negative' }),
    );
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'ROOMS.TOO_MANY_FILES',
      expect.objectContaining({ appearance: 'negative' }),
    );
    mockSettingsStore.attachmentsMaxFileSize.set(50 * 1024 * 1024);
    mockSettingsStore.attachmentsMaxFilesPerMessage.set(10);
  });

  it('should not create an object url for heic or an empty file type', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    component.addFiles([
      new File(['a'], 'photo.heic', { type: 'image/heic' }),
      new File(['b'], 'unknown.bin', { type: '' }),
    ]);
    expect(component['files']().map((file) => file.kind)).toEqual([
      EAttachmentKind.FILE,
      EAttachmentKind.FILE,
    ]);
    expect(component['files']().every((file) => file.previewUrl === null)).toBe(
      true,
    );
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it('ignores paste and drop when attachments are disabled or a message is being edited', () => {
    mockSettingsStore.attachmentsEnabled.set(false);
    expect(
      component.addFiles([new File(['a'], 'a.txt', { type: 'text/plain' })]),
    ).toBe(false);
    expect(component['files']()).toEqual([]);

    mockSettingsStore.attachmentsEnabled.set(true);
    mockChatStore.editableMessage.set(mockReplyMessage);
    expect(
      component.addFiles([new File(['a'], 'a.txt', { type: 'text/plain' })]),
    ).toBe(false);
    expect(component['files']()).toEqual([]);
    mockSettingsStore.attachmentsEnabled.set(true);
    mockChatStore.editableMessage.set(null);
  });

  it('sends empty content when an edited message keeps its attachments', () => {
    const attachment: IAttachment = {
      id: 'att-1',
      kind: EAttachmentKind.IMAGE,
      name: 'a.png',
      mime: 'image/png',
      size: 10,
      width: 10,
      height: 10,
      durationMs: null,
      url: '/api/v1/attachments/att-1/content',
      thumbnailUrl: null,
    };
    mockChatStore.editableMessage.set({
      ...mockReplyMessage,
      attachments: [attachment],
    });
    component['control'].setValue('');
    component['onSubmit']();
    expect(mockChatStore.updateMessage).toHaveBeenCalledWith({
      messageId: mockReplyMessage.id,
      data: { content: '' },
    });
    mockChatStore.editableMessage.set(null);
  });

  it('stashes composer files when the chat changes', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:draft');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    component['files'].set([
      createLocalFile(new File(['a'], 'a.png', { type: 'image/png' })),
    ]);
    mockChatStore.target.set({ kind: 'room', id: 2 });
    TestBed.flushEffects();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:draft');
    mockChatStore.target.set({ kind: 'room', id: 1 });
  });

  it('uses a keyboard button and a file input without accept', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ChatEditorComponent],
      providers: [
        provideTranslateService(),
        { provide: ChatStore, useValue: mockChatStore },
        { provide: SettingsStore, useValue: mockSettingsStore },
        { provide: TuiNotificationService, useValue: mockNotificationService },
      ],
    }).compileComponents();
    const realFixture = TestBed.createComponent(ChatEditorComponent);
    realFixture.detectChanges();
    const input = realFixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const button = input.previousElementSibling as HTMLButtonElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    expect(button.tagName).toBe('BUTTON');
    expect(input.hasAttribute('accept')).toBe(false);
    button.click();
    expect(click).toHaveBeenCalled();
  });
});
