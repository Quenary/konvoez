import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { IKonvoezLocalBridge, IUpdaterState } from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { UpdaterDialogComponent } from './updater-dialog.component';

describe('UpdaterDialogComponent', () => {
  let fixture: ComponentFixture<UpdaterDialogComponent>;
  let component: UpdaterDialogComponent;
  let mockBridge: IKonvoezLocalBridge;
  let stateListener: ((state: IUpdaterState) => void) | null = null;

  const setup = (initialState: IUpdaterState = { status: 'checking' }) => {
    stateListener = null;
    mockBridge = {
      server: {} as unknown as IKonvoezLocalBridge['server'],
      settings: {} as unknown as IKonvoezLocalBridge['settings'],
      picker: {} as unknown as IKonvoezLocalBridge['picker'],
      updater: {
        getInitial: vi.fn().mockResolvedValue({
          state: initialState,
          locale: 'en',
        }),
        getState: vi.fn().mockResolvedValue(initialState),
        onState: vi.fn((cb) => {
          stateListener = cb;
          return () => {
            stateListener = null;
          };
        }),
        download: vi.fn(),
        later: vi.fn(),
        restart: vi.fn(),
        retry: vi.fn(),
      },
    };

    TestBed.configureTestingModule({
      imports: [UpdaterDialogComponent],
      providers: [
        DesktopI18nService,
        { provide: KONVOEZ_LOCAL_BRIDGE, useValue: mockBridge },
      ],
    });

    fixture = TestBed.createComponent(UpdaterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('renders checking state with progress bar and close button', async () => {
    setup({ status: 'checking' });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('progress')).not.toBeNull();
    expect(host.textContent).toContain('Checking for updates…');

    (host.querySelector('button') as HTMLButtonElement).click();
    expect(mockBridge.updater.later).toHaveBeenCalledTimes(1);
  });

  it('renders up-to-date state with message and close button', async () => {
    setup({ status: 'up-to-date' });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Konvoez is up to date');

    (host.querySelector('button') as HTMLButtonElement).click();
    expect(mockBridge.updater.later).toHaveBeenCalledTimes(1);
  });

  it('renders available state with version, remind later and download buttons', async () => {
    setup({ status: 'available', version: '1.2.3' });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Version 1.2.3');

    const buttons = host.querySelectorAll('button');
    buttons[0].click();
    expect(mockBridge.updater.later).toHaveBeenCalledTimes(1);

    buttons[1].click();
    expect(mockBridge.updater.download).toHaveBeenCalledTimes(1);
  });

  it('renders downloading state with progress bar and transfer details', async () => {
    setup({
      status: 'downloading',
      progress: {
        percent: 42,
        bytesPerSecond: 1024 * 1024 * 2,
        transferred: 1024 * 1024 * 21,
        total: 1024 * 1024 * 50,
      },
    });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('21.0 / 50.0 MB • 2.0 MB/s');
    expect(host.textContent).toContain(
      'The download continues in the background',
    );

    (host.querySelector('button') as HTMLButtonElement).click();
    expect(mockBridge.updater.later).toHaveBeenCalledTimes(1);
  });

  it('renders ready-deferred state with deferral notice and restart button', async () => {
    setup({ status: 'ready-deferred' });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain(
      'Update will be installed after you leave the call',
    );

    const buttons = host.querySelectorAll('button');
    buttons[1].click();
    expect(mockBridge.updater.restart).toHaveBeenCalledTimes(1);
  });

  it('renders ready state with restart button', async () => {
    setup({ status: 'ready', version: '2.0.0' });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Update ready to install');
    expect(host.textContent).toContain('Version 2.0.0');

    const buttons = host.querySelectorAll('button');
    buttons[1].click();
    expect(mockBridge.updater.restart).toHaveBeenCalledTimes(1);
  });

  it('renders error state with retry and close buttons', async () => {
    setup({ status: 'error', error: 'updater.downloadFailed' });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Failed to download update');

    const buttons = host.querySelectorAll('button');
    buttons[1].click();
    expect(mockBridge.updater.retry).toHaveBeenCalledTimes(1);
  });

  it('renders disabled state in dev environment', async () => {
    setup({ status: 'disabled' });
    await component.ngOnInit();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Auto-update is disabled');
  });

  it('reacts to onState broadcasts from adapter', async () => {
    setup({ status: 'checking' });
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.updaterState().status).toBe('checking');

    stateListener?.({ status: 'available', version: '3.0.0' });
    fixture.detectChanges();

    expect(component.updaterState().status).toBe('available');
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Version 3.0.0');
  });
});
