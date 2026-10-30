import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IOutgoingMessage } from '@core/chat/outgoing/outgoing.types';
import { EMessageStatus, IMessageEntity } from '../../chat.store';
import { ChatMessageMenuComponent } from './chat-message-menu.component';

describe('ChatMessageMenuComponent', () => {
  let component: ChatMessageMenuComponent;
  let fixture: ComponentFixture<ChatMessageMenuComponent>;

  const testMessage: IMessageEntity = {
    id: 'msg-1',
    content: '<p>Hello</p>',
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
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageMenuComponent, MenuPreviewHostComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatMessageMenuComponent);
    fixture.componentRef.setInput('message', testMessage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('applies dialog modifier class when isDialog is true', () => {
    fixture.componentRef.setInput('isDialog', true);
    fixture.detectChanges();

    const menuEl = fixture.nativeElement.querySelector('.chat-message-menu');
    expect(menuEl.classList.contains('chat-message-menu--dialog')).toBe(true);
  });

  it('does not apply dialog modifier class when isDialog is false', () => {
    fixture.componentRef.setInput('isDialog', false);
    fixture.detectChanges();

    const menuEl = fixture.nativeElement.querySelector('.chat-message-menu');
    expect(menuEl.classList.contains('chat-message-menu--dialog')).toBe(false);
  });

  describe('when message is not outgoing', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('outgoing', null);
      fixture.componentRef.setInput('canEdit', true);
      fixture.componentRef.setInput('canDelete', true);
      fixture.componentRef.setInput('canViewReaders', true);
      fixture.detectChanges();
    });

    it('renders reactions bar and action options', () => {
      const reactionsBar = fixture.nativeElement.querySelector(
        'app-chat-message-reactions-bar',
      );
      expect(reactionsBar).toBeTruthy();

      const buttons = fixture.nativeElement.querySelectorAll(
        'tui-data-list button[tuiOption]',
      );
      // Reply, Edit, Delete, Read By
      expect(buttons.length).toBe(4);
    });

    it('emits reply when reply is clicked', () => {
      const replySpy = vi.fn();
      component.reply.subscribe(replySpy);

      component['onReply']();

      expect(replySpy).toHaveBeenCalledOnce();
    });

    it('emits edit when edit is clicked', () => {
      const editSpy = vi.fn();
      component.edit.subscribe(editSpy);

      component['onEdit']();

      expect(editSpy).toHaveBeenCalledOnce();
    });

    it('emits delete when delete is clicked', () => {
      const deleteSpy = vi.fn();
      component.delete.subscribe(deleteSpy);

      component['onDelete']();

      expect(deleteSpy).toHaveBeenCalledOnce();
    });

    it('emits viewReaders when read by is clicked', () => {
      const readersSpy = vi.fn();
      component.viewReaders.subscribe(readersSpy);

      component['onViewReaders']();

      expect(readersSpy).toHaveBeenCalledOnce();
    });

    it('emits react when onReact is called', () => {
      const reactSpy = vi.fn();
      component.react.subscribe(reactSpy);

      component['onReact']('👍');

      expect(reactSpy).toHaveBeenCalledWith('👍');
    });
  });

  describe('when message is outgoing', () => {
    beforeEach(() => {
      const outgoing: IOutgoingMessage = {
        clientId: 'client-1',
        files: [],
        state: { phase: 'uploading' },
      } as unknown as IOutgoingMessage;

      fixture.componentRef.setInput('outgoing', outgoing);
      fixture.componentRef.setInput('canCancelSending', true);
      fixture.detectChanges();
    });

    it('does not render reactions bar and renders cancel sending button', () => {
      const reactionsBar = fixture.nativeElement.querySelector(
        'app-chat-message-reactions-bar',
      );
      expect(reactionsBar).toBeFalsy();

      const buttons = fixture.nativeElement.querySelectorAll(
        'tui-data-list button[tuiOption]',
      );
      expect(buttons.length).toBe(1);
    });

    it('emits cancelSending when onCancelSending is called', () => {
      const cancelSpy = vi.fn();
      component.cancelSending.subscribe(cancelSpy);

      component['onCancelSending']();

      expect(cancelSpy).toHaveBeenCalledOnce();
    });
  });

  it('renders projected preview before the action list', () => {
    const hostFixture = TestBed.createComponent(MenuPreviewHostComponent);
    hostFixture.detectChanges();

    const menu = hostFixture.nativeElement.querySelector(
      '.chat-message-menu',
    ) as HTMLElement;
    const preview = menu.querySelector('.preview');
    const reactions = menu.querySelector('app-chat-message-reactions-bar');
    expect(preview).toBeInstanceOf(HTMLElement);
    expect(reactions).toBeInstanceOf(HTMLElement);
    if (
      !(preview instanceof HTMLElement) ||
      !(reactions instanceof HTMLElement)
    ) {
      return;
    }
    expect(preview.textContent?.trim()).toBe('Hello');
    expect(
      preview.compareDocumentPosition(reactions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

@Component({
  imports: [ChatMessageMenuComponent],
  template: `
    <app-chat-message-menu
      [isDialog]="true"
      [message]="message">
      <div
        class="preview"
        messagePreview>
        Hello
      </div>
    </app-chat-message-menu>
  `,
})
class MenuPreviewHostComponent {
  protected readonly message: IMessageEntity = {
    id: 'msg-1',
    content: '<p>Hello</p>',
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
  };
}
