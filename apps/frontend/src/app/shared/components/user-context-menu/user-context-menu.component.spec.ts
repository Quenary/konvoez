import { signal, TemplateRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDropdownDirective, TuiPopupService } from '@taiga-ui/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { selectCurrentUser } from '@core/auth/auth.selectors';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { UserContextMenuComponent } from './user-context-menu.component';

describe('UserContextMenuComponent', () => {
  let fixture: ComponentFixture<UserContextMenuComponent>;
  let component: UserContextMenuComponent;
  const peerGainLevels = signal<Record<number, number>>({ 2: 0.8 });
  const setPeerGain = vi.fn();

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

    await TestBed.configureTestingModule({
      imports: [UserContextMenuComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          selectors: [
            {
              selector: selectCurrentUser,
              value: { id: 1, username: 'alice' },
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
          provide: TuiPopupService,
          useValue: {
            add: vi.fn(),
            remove: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserContextMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays username in opt-group label', () => {
    fixture.componentRef.setInput('username', 'bob');
    fixture.detectChanges();

    const optGroup = fixture.nativeElement.querySelector('tui-opt-group');
    expect(optGroup?.getAttribute('data-label')).toBe('bob');
  });

  it('should emit only details when moderation is hidden and userId not provided', () => {
    const details = vi.fn();
    component.details.subscribe(details);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
    expect(buttons[0].getAttribute('style')).toContain('info');
    buttons[0].click();
    expect(details).toHaveBeenCalledOnce();
  });

  it('renders volume button with icon and handles volume changes for remote peers', () => {
    fixture.componentRef.setInput('userId', 2);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
    expect(buttons[1].textContent).toContain('CALL.VOLUME');
    expect(buttons[1].getAttribute('style')).toContain('volume-2');

    const volumeOptionDe = fixture.debugElement.query(
      (de) => de.nativeElement === buttons[1],
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

  it('hides volume button when userId is current user', () => {
    fixture.componentRef.setInput('userId', 1);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
  });

  it('should emit details, move from nested submenu, and disconnect', () => {
    fixture.componentRef.setInput('canModerate', true);
    fixture.componentRef.setInput('moveTargets', [{ id: 2, name: 'lounge' }]);
    fixture.detectChanges();

    const details = vi.fn();
    const move = vi.fn();
    const disconnect = vi.fn();
    component.details.subscribe(details);
    component.move.subscribe(move);
    component.disconnect.subscribe(disconnect);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
    expect(buttons[1].textContent).toContain('VOICE.MOVE_TO');
    expect(buttons[1].getAttribute('style')).toContain('arrow-down-up');
    expect(buttons[1].getAttribute('style')).toContain('chevron-right');
    expect(buttons[2].classList.contains('destructive')).toBe(true);
    expect(buttons[2].getAttribute('style')).toContain('circle-x');

    buttons[0].click();
    buttons[2].click();
    expect(details).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();

    const moveOptionDe = fixture.debugElement.query(
      (de) => de.nativeElement === buttons[1],
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
      .find((button) => button.textContent?.includes('lounge'));

    expect(targetButton).toBeInstanceOf(HTMLElement);
    (targetButton as HTMLElement).click();
    expect(move).toHaveBeenCalledWith({ id: 2, name: 'lounge' });
    view.destroy();
  });

  it('should hide move option when moveTargets list is empty', () => {
    fixture.componentRef.setInput('canModerate', true);
    fixture.detectChanges();

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'button[tuiOption]',
      ),
    );
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
    expect(buttons[1].textContent).toContain('VOICE.DISCONNECT_FROM_VOICE');
    const hasMoveButton = buttons.some((btn) =>
      btn.textContent?.includes('VOICE.MOVE_TO'),
    );
    expect(hasMoveButton).toBe(false);
  });
});
