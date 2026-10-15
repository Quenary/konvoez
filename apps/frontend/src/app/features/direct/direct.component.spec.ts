import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { DirectComponent } from './direct.component';
import { DirectStore } from './direct.store';
import { IUser } from '@konvoez/shared';

@Component({
  selector: 'app-chat',
  template: '<ng-content select="[chatHeaderActions]" />',
})
class MockChatComponent {
  public readonly roomId = input<number | null>(null);
  public readonly recipientId = input<number | null>(null);
  public readonly title = input.required<string>();
  public readonly avatarUrl = input<string | null>(null);
  public readonly avatarIcon = input<string | null>(null);
}

@Component({ selector: 'app-voice-room-shell', template: '' })
class MockVoiceRoomShellComponent {
  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly headerActions = input<unknown>(null);
}

describe('DirectComponent', () => {
  let component: DirectComponent;
  let fixture: ComponentFixture<DirectComponent>;

  const mockUser: IUser = {
    id: 99,
    username: 'bob',
    fullname: 'Bob',
    avatarUrl: null,
  } as IUser;

  const recipientId = signal<number | null>(99);
  const user = signal<IUser | null>(mockUser);
  const isSelf = signal(false);
  const isCurrentDirectCallActive = signal(false);
  const canRejoinCall = signal(false);
  const preferChat = signal(false);
  const title = signal('bob');
  const avatarUrl = signal<string | null>(null);
  const avatarIcon = signal<string | null>(null);
  const view = signal<'call' | 'chat'>('chat');

  const mockDirectStore = {
    recipientId,
    user,
    isSelf,
    isCurrentDirectCallActive,
    canRejoinCall,
    preferChat,
    title,
    avatarUrl,
    avatarIcon,
    view,
    showChat: vi.fn(),
    showCall: vi.fn(),
    startDirectCall: vi.fn(),
    rejoinDirectCall: vi.fn(),
    hangup: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    recipientId.set(99);
    user.set(mockUser);
    isSelf.set(false);
    isCurrentDirectCallActive.set(false);
    canRejoinCall.set(false);
    preferChat.set(false);
    title.set('bob');
    avatarUrl.set(null);
    avatarIcon.set(null);
    view.set('chat');

    await TestBed.configureTestingModule({
      imports: [DirectComponent],
      providers: [provideTranslateService()],
    })
      .overrideComponent(DirectComponent, {
        set: {
          providers: [{ provide: DirectStore, useValue: mockDirectStore }],
        },
      })
      .overrideComponent(DirectComponent, {
        remove: {
          imports: [ChatComponent, VoiceRoomShellComponent],
        },
        add: {
          imports: [MockChatComponent, MockVoiceRoomShellComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DirectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const queryChat = (): Element | null =>
    fixture.nativeElement.querySelector('app-chat');

  const queryVoiceShell = (): Element | null =>
    fixture.nativeElement.querySelector('app-voice-room-shell');

  it('creates component and defaults to chat view', () => {
    expect(component).toBeTruthy();
    expect(queryChat()).toBeTruthy();
    expect(queryVoiceShell()).toBeNull();
  });

  it('mounts voice room shell when view is call', () => {
    view.set('call');
    fixture.detectChanges();

    expect(queryVoiceShell()).toBeTruthy();
    expect(queryChat()).toBeNull();
  });

  it('delegates showChat to directStore', () => {
    component['showChat']();
    expect(mockDirectStore.showChat).toHaveBeenCalled();
  });

  it('delegates showCall to directStore', () => {
    component['showCall']();
    expect(mockDirectStore.showCall).toHaveBeenCalled();
  });

  it('delegates startDirectCall to directStore', () => {
    component['startDirectCall'](mockUser);
    expect(mockDirectStore.startDirectCall).toHaveBeenCalledWith(mockUser);
  });

  it('delegates rejoinDirectCall to directStore', () => {
    component['rejoinDirectCall'](mockUser);
    expect(mockDirectStore.rejoinDirectCall).toHaveBeenCalledWith(mockUser);
  });

  it('delegates hangup to directStore', () => {
    component['hangup']();
    expect(mockDirectStore.hangup).toHaveBeenCalled();
  });

  it('renders start call button when not in call and not rejoinable', () => {
    const startCallBtn = fixture.nativeElement.querySelector(
      'button[iconStart="@tui.phone"]',
    );
    expect(startCallBtn).toBeTruthy();
    startCallBtn.click();
    expect(mockDirectStore.startDirectCall).toHaveBeenCalledWith(mockUser);
  });

  it('renders rejoin call button when canRejoinCall is true', () => {
    canRejoinCall.set(true);
    fixture.detectChanges();

    const joinBtn = fixture.nativeElement.querySelector(
      'app-pulse-indicator button',
    );
    expect(joinBtn).toBeTruthy();
    joinBtn.click();
    expect(mockDirectStore.rejoinDirectCall).toHaveBeenCalledWith(mockUser);
  });

  it('renders call and hangup buttons when current direct call is active', () => {
    isCurrentDirectCallActive.set(true);
    fixture.detectChanges();

    const toCallBtn = fixture.nativeElement.querySelector(
      'button[iconStart="@tui.phone-call"]',
    );
    const hangupBtn = fixture.nativeElement.querySelector(
      'button[iconStart="@tui.phone-off"]',
    );
    expect(toCallBtn).toBeTruthy();
    expect(hangupBtn).toBeTruthy();

    toCallBtn.click();
    expect(mockDirectStore.showCall).toHaveBeenCalled();

    hangupBtn.click();
    expect(mockDirectStore.hangup).toHaveBeenCalled();
  });

  it('hides call buttons in header when isSelf is true (saved messages)', () => {
    isSelf.set(true);
    title.set('DIRECT.SAVED_MESSAGES');
    avatarIcon.set('@tui.bookmark');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('button[iconStart="@tui.phone"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        'button[iconStart="@tui.phone-call"]',
      ),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('button[iconStart="@tui.phone-off"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-pulse-indicator'),
    ).toBeNull();
  });
});
