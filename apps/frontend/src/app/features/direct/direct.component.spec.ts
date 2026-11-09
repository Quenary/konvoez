import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, output, signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { DirectComponent } from './direct.component';
import { DirectStore } from './direct.store';
import { IUserSafe } from '@konvoez/shared';
import { icons } from '@constants';

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
  public readonly isOnline = input<boolean>(false);
  public readonly initialMessageId = input<string | null>(null);
  public readonly headerClick = output<void>();
  public readonly initialMessageApplied = output<void>();
}

@Component({ selector: 'app-voice-room-shell', template: '' })
class MockVoiceRoomShellComponent {
  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly headerActions = input<unknown>(null);
  public readonly headerClick = output<void>();
}

describe('DirectComponent', () => {
  let component: DirectComponent;
  let fixture: ComponentFixture<DirectComponent>;

  const mockUser: IUserSafe = {
    id: 99,
    username: 'bob',
    fullname: 'Bob',
    avatarUrl: null,
  } as IUserSafe;

  const recipientId = signal<number | null>(99);
  const user = signal<IUserSafe | null>(mockUser);
  const isSelf = signal(false);
  const isCurrentDirectCallActive = signal(false);
  const canRejoinCall = signal(false);
  const preferChat = signal(false);
  const title = signal('bob');
  const avatarUrl = signal<string | null>(null);
  const avatarIcon = signal<string | null>(null);
  const isOnline = signal(false);
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
    isOnline,
    view,
    showChat: vi.fn(),
    showCall: vi.fn(),
    startDirectCall: vi.fn(),
    rejoinDirectCall: vi.fn(),
    hangup: vi.fn(),
  };

  let queryParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let routerNavigate: ReturnType<typeof vi.fn>;
  const mockUserDialogService = {
    open: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    queryParamMap$ = new BehaviorSubject(convertToParamMap({}));
    routerNavigate = vi.fn().mockResolvedValue(true);
    recipientId.set(99);
    user.set(mockUser);
    isSelf.set(false);
    isCurrentDirectCallActive.set(false);
    canRejoinCall.set(false);
    preferChat.set(false);
    title.set('bob');
    avatarUrl.set(null);
    avatarIcon.set(null);
    isOnline.set(false);
    view.set('chat');

    await TestBed.configureTestingModule({
      imports: [DirectComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: mockUser }],
        }),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParamMap$ },
        },
        { provide: Router, useValue: { navigate: routerNavigate } },
        { provide: UserDialogService, useValue: mockUserDialogService },
      ],
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

  afterEach(() => {
    TestBed.inject(MockStore).resetSelectors();
  });

  const queryChat = (): Element | null =>
    fixture.nativeElement.querySelector('app-chat');

  const queryVoiceShell = (): Element | null =>
    fixture.nativeElement.querySelector('app-voice-room-shell');

  const headerActionButtons = (): HTMLButtonElement[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll('[chatHeaderActions] button'),
    );

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
    const [startCallBtn] = headerActionButtons();
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

    const [toCallBtn, hangupBtn] = headerActionButtons();
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
    avatarIcon.set(icons.bookmark);
    fixture.detectChanges();

    expect(headerActionButtons().length).toBe(0);
    expect(
      fixture.nativeElement.querySelector('app-pulse-indicator'),
    ).toBeNull();
  });

  it('binds isOnline to app-chat', () => {
    isOnline.set(true);
    fixture.detectChanges();

    const chatDebugEl = fixture.debugElement.query(
      (de) => de.componentInstance instanceof MockChatComponent,
    );
    expect(chatDebugEl).toBeTruthy();
    expect(chatDebugEl.componentInstance.isOnline()).toBe(true);

    isOnline.set(false);
    fixture.detectChanges();
    expect(chatDebugEl.componentInstance.isOnline()).toBe(false);
  });

  it('opens the user dialog for the direct peer', () => {
    component['openDetails']();
    expect(mockUserDialogService.open).toHaveBeenCalledWith(mockUser, {
      withFiles: true,
      withInput: false,
    });
  });

  it('opens the user dialog for the current user in saved messages', () => {
    user.set(null);
    isSelf.set(true);

    component['openDetails']();

    expect(mockUserDialogService.open).toHaveBeenCalledWith(mockUser, {
      withFiles: true,
      withInput: false,
    });
  });

  it('reads message query param and clears it via router navigation', async () => {
    routerNavigate.mockClear();

    queryParamMap$.next(convertToParamMap({ message: 'msg-456' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['targetMessageId']()).toBe('msg-456');
    expect(routerNavigate).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { message: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('keeps a message id and shows the chat when a call hides it', async () => {
    view.set('call');
    fixture.detectChanges();
    expect(queryChat()).toBeNull();

    queryParamMap$.next(convertToParamMap({ message: 'msg-456' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockDirectStore.showChat).toHaveBeenCalled();
    expect(component['heldMessageId']()).toBe('msg-456');

    queryParamMap$.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(component['targetMessageId']()).toBeNull();
    expect(component['heldMessageId']()).toBe('msg-456');

    view.set('chat');
    fixture.detectChanges();
    const chatDebugEl = fixture.debugElement.query(
      (de) => de.componentInstance instanceof MockChatComponent,
    );
    expect(chatDebugEl.componentInstance.initialMessageId()).toBe('msg-456');

    chatDebugEl.componentInstance.initialMessageApplied.emit();
    fixture.detectChanges();
    expect(component['heldMessageId']()).toBeNull();
    expect(chatDebugEl.componentInstance.initialMessageId()).toBeNull();
  });
});
