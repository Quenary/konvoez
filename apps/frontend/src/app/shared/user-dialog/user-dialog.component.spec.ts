/** @vitest-environment jsdom */
import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  IOutgoingMessageCallbacks,
  OutgoingMessagesStore,
} from '@core/chat/outgoing/outgoing-messages.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { IUserSafe } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { provideStore } from '@ngrx/store';
import { provideRouter, Router } from '@angular/router';
import { TuiNotificationService } from '@taiga-ui/core';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatEditorComponent,
  IChatEditorSubmission,
} from '../components/chat/chat-editor/chat-editor.component';
import { UserDialogComponent } from './user-dialog.component';

@Component({ selector: 'app-chat-editor', template: '' })
class MockChatEditorComponent {
  public readonly loading = input(false);
  public readonly submitted = output<IChatEditorSubmission>();
}

describe('UserDialogComponent', () => {
  let fixture: ComponentFixture<UserDialogComponent>;
  let router: Router;
  let initiateCall: ReturnType<typeof vi.fn>;
  let completeWith: ReturnType<typeof vi.fn>;
  let send: ReturnType<typeof vi.fn>;
  let notifications: { open: ReturnType<typeof vi.fn> };
  let peerGainLevels: ReturnType<typeof signal<Record<number, number>>>;
  let setPeerGain: ReturnType<typeof vi.fn>;

  const user: IUserSafe = {
    id: 42,
    username: 'alice',
    fullname: 'Alice Example',
    isOwner: false,
    roles: [],
    permissions: [],
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  let currentDialogUser: IUserSafe;
  let currentCompleteWith: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    initiateCall = vi.fn().mockResolvedValue(undefined);
    completeWith = vi.fn();
    currentDialogUser = user;
    currentCompleteWith = completeWith;
    send = vi.fn();
    notifications = {
      open: vi.fn(() => ({ subscribe: vi.fn() })),
    };
    peerGainLevels = signal<Record<number, number>>({});
    setPeerGain = vi.fn();

    await TestBed.configureTestingModule({
      imports: [UserDialogComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideStore({
          auth: () => ({ user: { id: 1, username: 'tester' } }),
        }),
        {
          provide: POLYMORPHEUS_CONTEXT,
          useFactory: () => ({
            get data() {
              return { user: currentDialogUser };
            },
            completeWith: (...args: unknown[]) =>
              Reflect.apply(currentCompleteWith, null, args),
          }),
        },
        { provide: DirectCallService, useValue: { initiateCall } },
        {
          provide: OutgoingMessagesStore,
          useValue: {
            send,
          },
        },
        { provide: TuiNotificationService, useValue: notifications },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: { peerGainLevels, setPeerGain },
        },
      ],
    })
      .overrideComponent(UserDialogComponent, {
        remove: { imports: [ChatEditorComponent] },
        add: { imports: [MockChatEditorComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UserDialogComponent);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('shows the avatar, nickname, and full name', () => {
    const text = fixture.nativeElement.textContent as string;
    const avatar = fixture.nativeElement.querySelector(
      'app-user-avatar',
    ) as HTMLElement | null;

    expect(avatar).not.toBeNull();
    expect(text).toContain(user.username);
    expect(text).toContain(user.fullname);
  });

  it('shows and updates the selected user gain', () => {
    const component = fixture.componentInstance;
    expect(component['volume']()).toBe(100);

    peerGainLevels.set({ [user.id]: 0.25 });
    expect(component['volume']()).toBe(25);

    component['onVolumeChange'](125);
    expect(setPeerGain).toHaveBeenCalledExactlyOnceWith(user.id, 1.25);
  });

  it('navigates to the direct chat and closes the dialog', () => {
    const [, chatButton] = fixture.nativeElement.querySelectorAll('button');

    expect(chatButton.getAttribute('aria-label')).toBe('USER_DIALOG.OPEN_CHAT');
    expect(
      fixture.nativeElement.querySelector('span[tuiTitle]')?.textContent,
    ).toContain('USER_DIALOG.QUICK_MESSAGE');

    chatButton.click();

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([
      '/direct',
      user.id,
    ]);
    expect(completeWith).toHaveBeenCalledOnce();
  });

  it('sends a direct message with attachments, notifies success, and closes', () => {
    const editor = fixture.debugElement.query(
      By.directive(MockChatEditorComponent),
    ).componentInstance as MockChatEditorComponent;
    const files: IChatEditorSubmission['files'] = [];

    editor.submitted.emit({
      content: '<p>Hello</p>',
      files,
      replyToMessage: null,
    });

    const request = send.mock.calls[0]?.[0] as {
      tempId: string;
      onSuccess: IOutgoingMessageCallbacks['onSuccess'];
      data: {
        content: string;
        roomId: number | null;
        recipientId: number | null;
      };
      files: IChatEditorSubmission['files'];
    };
    expect(request.data).toMatchObject({
      content: '<p>Hello</p>',
      roomId: null,
      recipientId: user.id,
    });
    expect(request.files).toBe(files);
    expect(completeWith).not.toHaveBeenCalled();

    request.onSuccess?.({
      id: 'message-1',
      senderId: 1,
      senderUsername: 'sender',
      roomId: null,
      recipientId: user.id,
      content: '<p>Hello</p>',
      createdAt: new Date(),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: request.tempId,
      replyTo: null,
      reactions: [],
      mentions: { userIds: [], roleIds: [], everyone: false },
    });
    expect(completeWith).toHaveBeenCalledOnce();
    expect(notifications.open).toHaveBeenCalledWith(
      'USER_DIALOG.MESSAGE_SENT',
      expect.objectContaining({ appearance: 'positive' }),
    );
  });

  it('closes the dialog on failure without showing a duplicate notification', () => {
    const editor = fixture.debugElement.query(
      By.directive(MockChatEditorComponent),
    ).componentInstance as MockChatEditorComponent;
    editor.submitted.emit({
      content: '<p>Hello</p>',
      files: [],
      replyToMessage: null,
    });
    const sentRequest = send.mock.calls[0]?.[0] as {
      onError: IOutgoingMessageCallbacks['onError'];
    };

    sentRequest.onError?.(new Error('send failed'));
    expect(completeWith).toHaveBeenCalledOnce();
    expect(notifications.open).not.toHaveBeenCalled();
  });

  it('starts a direct call with the selected user', () => {
    const [, , callButton] = fixture.nativeElement.querySelectorAll('button');

    callButton.click();

    expect(initiateCall).toHaveBeenCalledExactlyOnceWith(user);
  });

  describe('when viewing own profile (isSelf)', () => {
    let selfFixture: ComponentFixture<UserDialogComponent>;
    let selfCompleteWith: ReturnType<typeof vi.fn>;

    const currentUserData: IUserSafe = {
      ...user,
      id: 1,
      username: 'tester',
    };

    beforeEach(() => {
      selfCompleteWith = vi.fn();
      currentDialogUser = currentUserData;
      currentCompleteWith = selfCompleteWith;
      selfFixture = TestBed.createComponent(UserDialogComponent);
      selfFixture.detectChanges();
    });

    it('renders chat, profile, and devices buttons with self translations, and hides volume and call', () => {
      const buttons = selfFixture.nativeElement.querySelectorAll(
        '.footer-actions button',
      );
      expect(buttons.length).toBe(3);

      const [chatBtn, profileBtn, devicesBtn] = buttons;
      expect(chatBtn.getAttribute('aria-label')).toBe(
        'USER_DIALOG.SAVED_MESSAGES',
      );
      expect(profileBtn.getAttribute('aria-label')).toBe(
        'USER_DIALOG.OPEN_PROFILE',
      );
      expect(devicesBtn.getAttribute('aria-label')).toBe(
        'USER_DIALOG.OPEN_DEVICES_SETTINGS',
      );
      expect(
        selfFixture.nativeElement.querySelector(
          'button[aria-label="USER_DIALOG.CALL"]',
        ),
      ).toBeNull();
      expect(
        selfFixture.nativeElement.querySelector(
          'button[aria-label="CALL.VOLUME"]',
        ),
      ).toBeNull();
      expect(
        selfFixture.nativeElement.querySelector('span[tuiTitle]')?.textContent,
      ).toContain('USER_DIALOG.SAVED_MESSAGES');
    });

    it('navigates to settings profile on profile button click', () => {
      const profileBtn = selfFixture.nativeElement.querySelector(
        'button[aria-label="USER_DIALOG.OPEN_PROFILE"]',
      );
      profileBtn.click();

      expect(router.navigate).toHaveBeenCalledWith(['/settings/profile']);
      expect(selfCompleteWith).toHaveBeenCalledOnce();
    });

    it('navigates to settings devices on devices button click', () => {
      const devicesBtn = selfFixture.nativeElement.querySelector(
        'button[aria-label="USER_DIALOG.OPEN_DEVICES_SETTINGS"]',
      );
      devicesBtn.click();

      expect(router.navigate).toHaveBeenCalledWith(['/settings/devices']);
      expect(selfCompleteWith).toHaveBeenCalledOnce();
    });
  });
});
