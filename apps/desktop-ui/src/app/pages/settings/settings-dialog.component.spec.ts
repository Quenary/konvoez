import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { SettingsDialogComponent } from './settings-dialog.component';

describe('SettingsDialogComponent', () => {
  let fixture: ComponentFixture<SettingsDialogComponent>;
  let component: SettingsDialogComponent;
  let mockBridge: IKonvoezLocalBridge;

  const setup = (
    initialOverrides?: Partial<
      Awaited<ReturnType<IKonvoezLocalBridge['settings']['getInitial']>>
    >,
    saveResult?: Promise<{
      hotkeys: {
        toggleMic: 'ok' | 'conflict';
        toggleSpeaker: 'ok' | 'conflict';
      };
    }>,
  ) => {
    mockBridge = {
      server: {} as unknown as IKonvoezLocalBridge['server'],
      settings: {
        getInitial: vi.fn().mockResolvedValue({
          hotkeys: {
            toggleMic: 'CommandOrControl+Shift+M',
            toggleSpeaker: 'CommandOrControl+Shift+D',
          },
          autostart: true,
          nativeHotkeys: true,
          locale: 'en',
          ...initialOverrides,
        }),
        save: vi.fn().mockImplementation(
          () =>
            saveResult ??
            Promise.resolve({
              hotkeys: { toggleMic: 'ok', toggleSpeaker: 'ok' },
            }),
        ),
        suspendHotkeys: vi.fn(),
        resumeHotkeys: vi.fn(),
      },
      picker: {} as unknown as IKonvoezLocalBridge['picker'],
      updater: {} as unknown as IKonvoezLocalBridge['updater'],
    };

    TestBed.configureTestingModule({
      imports: [SettingsDialogComponent],
      providers: [
        DesktopI18nService,
        { provide: KONVOEZ_LOCAL_BRIDGE, useValue: mockBridge },
      ],
    });

    fixture = TestBed.createComponent(SettingsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('renders hint paragraph with settings.hotkeysHint text', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    const hint = (fixture.nativeElement as HTMLElement).querySelector(
      'p.tui-text_body-s',
    );
    expect(hint?.textContent?.trim()).toContain(
      'Hotkeys work system-wide, even when the app is in the background',
    );
  });

  it('warns that keys are captured when the native hook is unavailable', async () => {
    setup({ nativeHotkeys: false });
    await component.ngOnInit();
    fixture.detectChanges();

    const hint = (fixture.nativeElement as HTMLElement).querySelector(
      'p.tui-text_body-s',
    );
    expect(hint?.textContent?.trim()).toContain(
      'A key bound without a modifier (Ctrl, Alt, Shift) is captured in all apps',
    );
  });

  it('start/stop recording calls suspendHotkeys/resumeHotkeys balanced', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    component['handleRecordingStart']();
    expect(mockBridge.settings.suspendHotkeys).toHaveBeenCalledTimes(1);

    component['handleRecordingStop']();
    expect(mockBridge.settings.resumeHotkeys).toHaveBeenCalledTimes(1);
  });

  it('save sends edited hotkeys and autostart', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    component.micKey.set('F12');
    component.autostart.set(false);
    fixture.detectChanges();

    const onSaved = vi.fn();
    component.saved.subscribe(onSaved);

    const saveBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    ) as HTMLButtonElement;
    saveBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBridge.settings.save).toHaveBeenCalledWith({
      hotkeys: {
        toggleMic: 'F12',
        toggleSpeaker: 'CommandOrControl+Shift+D',
      },
      autostart: false,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(component.saveMessage()?.variant).toBe('success');
  });

  it('conflict status renders conflict on that input', async () => {
    setup(
      {},
      Promise.resolve({
        hotkeys: { toggleMic: 'conflict', toggleSpeaker: 'ok' },
      }),
    );
    await component.ngOnInit();
    fixture.detectChanges();

    const onSaved = vi.fn();
    component.saved.subscribe(onSaved);

    const saveBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    ) as HTMLButtonElement;
    saveBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.micError()).toBe('Shortcut conflict with another app');
    expect(component.speakerHint()).toBe('Registered');
    expect(component.saveMessage()).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('save rejection shows settings.saveFailed', async () => {
    setup({}, Promise.reject(new Error('FAIL')));
    await component.ngOnInit();
    fixture.detectChanges();

    const saveBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    ) as HTMLButtonElement;
    saveBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.saveMessage()?.variant).toBe('error');
    expect(component.saveMessage()?.text).toBe('Failed to save settings');
  });
});
