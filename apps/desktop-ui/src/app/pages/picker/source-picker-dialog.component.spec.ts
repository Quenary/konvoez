import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { SourcePickerDialogComponent } from './source-picker-dialog.component';

describe('SourcePickerDialogComponent', () => {
  let fixture: ComponentFixture<SourcePickerDialogComponent>;
  let component: SourcePickerDialogComponent;
  let mockBridge: IKonvoezLocalBridge;

  const mockSources = [
    {
      id: 'screen:0:0',
      name: 'Entire Screen',
      thumbnailUrl: 'data:image/png;base64,111',
      appIconUrl: null,
    },
    {
      id: 'window:42',
      name: 'Terminal',
      thumbnailUrl: 'data:image/png;base64,222',
      appIconUrl: null,
    },
  ];

  const setup = (
    initialOverrides?: Partial<
      Awaited<ReturnType<IKonvoezLocalBridge['picker']['getInitial']>>
    >,
  ) => {
    mockBridge = {
      server: {} as unknown as IKonvoezLocalBridge['server'],
      settings: {} as unknown as IKonvoezLocalBridge['settings'],
      picker: {
        getInitial: vi.fn().mockResolvedValue({
          sources: mockSources,
          shareAudio: true,
          audioSupported: true,
          nativeAudio: true,
          locale: 'en',
          audioStreams: [],
          ...initialOverrides,
        }),
        setShareAudio: vi.fn(),
        pick: vi.fn(),
      },
      updater: {} as unknown as IKonvoezLocalBridge['updater'],
    };

    TestBed.configureTestingModule({
      imports: [SourcePickerDialogComponent],
      providers: [
        DesktopI18nService,
        { provide: KONVOEZ_LOCAL_BRIDGE, useValue: mockBridge },
      ],
    });

    fixture = TestBed.createComponent(SourcePickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('screens tab filters out window: ids and preselects first item', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.activeTab()).toBe('screens');
    expect(component.currentSources()).toHaveLength(1);
    expect(component.currentSources()[0].id).toBe('screen:0:0');
    expect(component.selectedId()).toBe('screen:0:0');
  });

  it('switching tabs updates activeTab and preselects first item of that tab', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    const tabBtns = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[tuiTab]',
    );
    (tabBtns[1] as HTMLElement).click();
    fixture.detectChanges();

    expect(component.activeTab()).toBe('windows');
    expect(component.currentSources()).toHaveLength(1);
    expect(component.currentSources()[0].id).toBe('window:42');
    expect(component.selectedId()).toBe('window:42');
  });

  it('clicking active tab again does not reset selection', async () => {
    setup({
      sources: [
        {
          id: 'screen:0:0',
          name: 'Screen 1',
          thumbnailUrl: 'data:image/png;base64,111',
          appIconUrl: null,
        },
        {
          id: 'screen:0:1',
          name: 'Screen 2',
          thumbnailUrl: 'data:image/png;base64,333',
          appIconUrl: null,
        },
      ],
    });
    await component.ngOnInit();
    fixture.detectChanges();

    component['onSourceSelected']('screen:0:1');
    expect(component.selectedId()).toBe('screen:0:1');

    const tabBtns = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[tuiTab]',
    );
    (tabBtns[0] as HTMLElement).click();
    fixture.detectChanges();

    expect(component.selectedId()).toBe('screen:0:1');
  });

  it('navigating tabs via keyboard arrows updates activeTab and preselects first item', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.activeTab()).toBe('screens');

    const tabsEl = (fixture.nativeElement as HTMLElement).querySelector(
      'tui-tabs',
    );
    tabsEl?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();

    expect(component.activeTab()).toBe('windows');
    expect(component.activeTabIndex()).toBe(1);
    expect(component.selectedId()).toBe('window:42');

    tabsEl?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    fixture.detectChanges();

    expect(component.activeTab()).toBe('screens');
    expect(component.activeTabIndex()).toBe(0);
    expect(component.selectedId()).toBe('screen:0:0');
  });

  it('activeItemIndexChange updates activeTab and preselects first item', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    component['onActiveTabIndexChange'](1);
    fixture.detectChanges();

    expect(component.activeTab()).toBe('windows');
    expect(component.activeTabIndex()).toBe(1);
    expect(component.selectedId()).toBe('window:42');
  });

  it('toggling audio calls setShareAudio(false)', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(mockBridge.picker.setShareAudio).toHaveBeenCalledWith(false);
    expect(component.shareAudio()).toBe(false);
  });

  it('Share calls pick(id, withAudio), Cancel and Escape call pick(null, withAudio)', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    const onPicked = vi.fn();
    const onCancelled = vi.fn();
    component.picked.subscribe(onPicked);
    component.cancelled.subscribe(onCancelled);

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.button-group button',
    );
    (buttons[1] as HTMLButtonElement).click();
    expect(mockBridge.picker.pick).toHaveBeenCalledWith('screen:0:0', true);
    expect(onPicked).toHaveBeenCalledWith({
      sourceId: 'screen:0:0',
      withAudio: true,
    });

    (buttons[0] as HTMLButtonElement).click();
    expect(mockBridge.picker.pick).toHaveBeenCalledWith(null, true);
    expect(onCancelled).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(mockBridge.picker.pick).toHaveBeenCalledWith(null, true);
    expect(onCancelled).toHaveBeenCalledTimes(2);
  });

  it('audioSupported:false hides the checkbox and the loopback hint', async () => {
    setup({ audioSupported: false, shareAudio: false });
    await component.ngOnInit();
    fixture.detectChanges();

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="checkbox"]',
    );
    const hint = (fixture.nativeElement as HTMLElement).querySelector(
      'p.audio-hint',
    );
    expect(checkbox).toBeNull();
    expect(hint).toBeNull();
  });

  it('warns about echo only when audio will be system loopback (nativeAudio: false)', async () => {
    setup({ audioSupported: true, nativeAudio: false });
    await component.ngOnInit();
    fixture.detectChanges();

    const hint = (fixture.nativeElement as HTMLElement).querySelector(
      'p.audio-hint',
    );
    expect(hint?.textContent?.trim()).toContain(
      'Broadcasts all system audio, including other participants',
    );
  });

  it('renders audio streams dropdown when streams are provided and audio is enabled on windows tab', async () => {
    setup({
      audioStreams: [
        { id: 'node-1', name: 'Spotify', pid: 1234 },
        { id: 'node-2', name: 'Firefox', pid: 5678 },
      ],
    });
    await component.ngOnInit();
    fixture.detectChanges();

    // On screens tab, select should not be shown
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '#audio-stream-select',
      ),
    ).toBeNull();

    // Switch to windows tab
    component['handleTabChange']('windows');
    fixture.detectChanges();

    const select = (fixture.nativeElement as HTMLElement).querySelector(
      '#audio-stream-select',
    );
    expect(select).not.toBeNull();

    component['onAudioStreamChange']('node-1');
    fixture.detectChanges();

    const shareBtn = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.button-group button',
    )[1] as HTMLButtonElement;
    shareBtn.click();
    expect(mockBridge.picker.pick).toHaveBeenCalledWith(
      'window:42',
      true,
      'node-1',
    );
  });
});
