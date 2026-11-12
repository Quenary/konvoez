import { signal, TemplateRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import {
  TuiDropdownDirective,
  TuiNotificationService,
  TuiPopupService,
} from '@taiga-ui/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EPermission, TVoiceRoomPeerUser } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { UserContextMenuComponent } from './user-context-menu.component';

describe('UserContextMenuComponent', () => {
  let fixture: ComponentFixture<UserContextMenuComponent>;
  let component: UserContextMenuComponent;

  const mockPeer: TVoiceRoomPeerUser = {
    id: 2,
    username: 'bob',
    fullname: 'Bob Smith',
    avatarUrl: null,
    isOwner: false,
    permissions: [],
    roles: [],
    createdAt: new Date(),
  };

  const peerGainLevels = signal<Record<number, number>>({ 2: 0.8 });
  const setPeerGain = vi.fn();
  const selectedRoomId = signal<number | null>(10);
  const voiceRooms = signal([
    { id: 10, name: 'here' },
    { id: 11, name: 'there' },
  ]);
  const moveMember = vi.fn().mockResolvedValue(undefined);
  const disconnectMember = vi.fn().mockResolvedValue(undefined);
  const openUserDialog = vi.fn().mockResolvedValue(undefined);
  const notifyOpen = vi.fn().mockReturnValue(of({}));

  const getDropdownTemplate = (
    directive: TuiDropdownDirective,
  ): TemplateRef<unknown> => {
    const rawContent = directive.content() as unknown;
    if (
      rawContent &&
      typeof rawContent === 'object' &&
      'template' in rawContent
    ) {
      return (rawContent as { template: TemplateRef<unknown> }).template;
    }
    return rawContent as TemplateRef<unknown>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    peerGainLevels.set({ 2: 0.8 });
    selectedRoomId.set(10);
    voiceRooms.set([
      { id: 10, name: 'here' },
      { id: 11, name: 'there' },
    ]);
    moveMember.mockResolvedValue(undefined);
    disconnectMember.mockResolvedValue(undefined);
    openUserDialog.mockResolvedValue(undefined);
    notifyOpen.mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [UserContextMenuComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          selectors: [
            {
              selector: selectCurrentUser,
              value: {
                id: 1,
                username: 'alice',
                isOwner: false,
                permissions: [EPermission.MOVE_MEMBERS],
              },
            },
          ],
        }),
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            peerGainLevels,
            setPeerGain,
          },
        },
        {
          provide: VoiceSessionStore,
          useValue: {
            selectedRoomId,
          },
        },
        {
          provide: RoomsStore,
          useValue: {
            voiceRooms,
          },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            moveMember,
            disconnectMember,
          },
        },
        {
          provide: UserDialogService,
          useValue: {
            open: openUserDialog,
          },
        },
        {
          provide: TuiPopupService,
          useValue: {
            add: vi.fn(),
            remove: vi.fn(),
          },
        },
        {
          provide: TuiNotificationService,
          useValue: {
            open: notifyOpen,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserContextMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('peer', mockPeer);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays peer username in opt-group label', () => {
    const optGroup = fixture.nativeElement.querySelector('tui-opt-group');
    expect(optGroup?.getAttribute('data-label')).toBe('bob');
  });

  it('opens user dialog and emits close on details click', () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button[tuiOption]',
      ),
    );
    const detailsBtn = buttons.find((btn) =>
      btn.textContent?.includes('ROOMS.DETAILS'),
    );
    expect(detailsBtn).toBeInstanceOf(HTMLElement);
    (detailsBtn as HTMLElement).click();

    expect(openUserDialog).toHaveBeenCalledWith(mockPeer, {
      withFiles: false,
      withInput: true,
    });
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('renders volume button for remote peers and handles volume change', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button[tuiOption]',
      ),
    );
    const volumeBtn = buttons.find((btn) =>
      btn.textContent?.includes('CALL.VOLUME'),
    );
    expect(volumeBtn).toBeTruthy();
    expect(volumeBtn?.getAttribute('style')).toContain('volume-2');

    const volumeOptionDe = fixture.debugElement.query(
      (de) => de.nativeElement === volumeBtn,
    );
    const dropdown = volumeOptionDe.injector.get(TuiDropdownDirective);
    const template = getDropdownTemplate(dropdown);
    const view = template.createEmbeddedView({});
    view.detectChanges();

    const volumeControl = (view.rootNodes as Node[]).find(
      (node): node is HTMLElement =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node as HTMLElement).tagName.toLowerCase() === 'app-volume-control',
    );
    expect(volumeControl).toBeTruthy();
    view.destroy();

    component['onVolumeChange'](50);
    expect(setPeerGain).toHaveBeenCalledWith(2, 0.5);
  });

  it('hides volume button when peer is the current user', () => {
    fixture.componentRef.setInput('peer', {
      ...mockPeer,
      id: 1,
      username: 'alice',
      fullname: 'Alice',
    });
    fixture.detectChanges();

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button[tuiOption]',
      ),
    );
    const volumeBtn = buttons.find((btn) =>
      btn.textContent?.includes('CALL.VOLUME'),
    );
    expect(volumeBtn).toBeUndefined();
  });

  it('offers move targets and executes move with close event', async () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button[tuiOption]',
      ),
    );
    const moveBtn = buttons.find((btn) =>
      btn.textContent?.includes('VOICE.MOVE_TO'),
    );
    expect(moveBtn).toBeTruthy();
    expect(moveBtn?.style.color).toBe('var(--tui-status-warning)');
    expect(moveBtn?.getAttribute('style')).toContain('arrow-down-up');

    const moveOptionDe = fixture.debugElement.query(
      (de) => de.nativeElement === moveBtn,
    );
    const dropdown = moveOptionDe.injector.get(TuiDropdownDirective);
    const template = getDropdownTemplate(dropdown);
    const view = template.createEmbeddedView({});
    view.detectChanges();

    const targetButton = (view.rootNodes as Node[])
      .flatMap((node) =>
        node instanceof HTMLElement
          ? Array.from(node.querySelectorAll('button[tuiOption]'))
          : [],
      )
      .find((button) => button.textContent?.includes('there'));

    expect(targetButton).toBeInstanceOf(HTMLElement);
    await (targetButton as HTMLElement).click();

    expect(moveMember).toHaveBeenCalledWith(2, 11);
    expect(closeSpy).toHaveBeenCalledOnce();
    view.destroy();
  });

  it('executes disconnect with close event', async () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button[tuiOption]',
      ),
    );
    const disconnectBtn = buttons.find((btn) =>
      btn.textContent?.includes('VOICE.DISCONNECT_FROM_VOICE'),
    );
    expect(disconnectBtn).toBeInstanceOf(HTMLElement);
    expect(disconnectBtn?.style.color).toBe('var(--tui-status-negative)');
    expect(disconnectBtn?.getAttribute('style')).toContain('circle-x');

    await (disconnectBtn as HTMLElement).click();

    expect(disconnectMember).toHaveBeenCalledWith(2, 10);
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('uses explicitly provided roomId when given', async () => {
    fixture.componentRef.setInput('roomId', 42);
    fixture.detectChanges();

    expect(component['effectiveRoomId']()).toBe(42);

    await component['onDisconnectMember']();
    expect(disconnectMember).toHaveBeenCalledWith(2, 42);
  });

  it('hides moderation in a direct call (roomId is null)', () => {
    selectedRoomId.set(null);
    fixture.componentRef.setInput('roomId', null);
    fixture.detectChanges();

    expect(component['canModerate']()).toBe(false);
    expect(component['moveTargets']()).toEqual([]);

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button[tuiOption]',
      ),
    );
    const moveBtn = buttons.find((btn) =>
      btn.textContent?.includes('VOICE.MOVE_TO'),
    );
    const disconnectBtn = buttons.find((btn) =>
      btn.textContent?.includes('VOICE.DISCONNECT_FROM_VOICE'),
    );
    expect(moveBtn).toBeUndefined();
    expect(disconnectBtn).toBeUndefined();
  });

  it('lets only an owner moderate an owner', () => {
    // Current user is non-owner with MOVE_MEMBERS
    fixture.componentRef.setInput('peer', { ...mockPeer, isOwner: true });
    fixture.detectChanges();

    expect(component['canModerate']()).toBe(false);
  });

  it('notifies error when move or disconnect fails', async () => {
    moveMember.mockRejectedValue(new Error('move failed'));
    disconnectMember.mockRejectedValue(new Error('disconnect failed'));

    await component['onMoveMember']({ id: 11, name: 'there' });
    expect(notifyOpen).toHaveBeenCalledWith(
      'GENERAL.UNKNOWN_ERROR',
      expect.objectContaining({ appearance: 'negative' }),
    );

    await component['onDisconnectMember']();
    expect(notifyOpen).toHaveBeenCalledWith(
      'GENERAL.UNKNOWN_ERROR',
      expect.objectContaining({ appearance: 'negative' }),
    );
  });
});
