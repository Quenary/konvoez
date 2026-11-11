import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import { TuiDialogService } from '@taiga-ui/core';
import { TUI_CONFIRM } from '@taiga-ui/kit';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { writeSavedServers } from './saved-servers';
import { ServerDialogComponent } from './server-dialog.component';

describe('ServerDialogComponent', () => {
  let fixture: ComponentFixture<ServerDialogComponent>;
  let component: ServerDialogComponent;
  let mockBridge: IKonvoezLocalBridge;
  let dialogOpen: ReturnType<typeof vi.fn>;

  const setup = (options?: {
    saveServerResult?: Promise<{ origin: string }>;
    saved?: readonly string[];
    confirm?: boolean;
  }) => {
    localStorage.clear();
    if (options?.saved) {
      writeSavedServers(localStorage, options.saved);
    }

    dialogOpen = vi.fn(() => of(options?.confirm ?? false));
    mockBridge = {
      server: {
        getInitial: vi.fn().mockResolvedValue({
          serverOrigin: 'https://initial.konvoez.com',
          locale: 'en',
        }),
        saveServer: vi.fn().mockImplementation(
          () =>
            options?.saveServerResult ??
            Promise.resolve({
              origin: 'https://saved.org',
            }),
        ),
      },
      settings: {} as unknown as IKonvoezLocalBridge['settings'],
      picker: {} as unknown as IKonvoezLocalBridge['picker'],
      updater: {} as unknown as IKonvoezLocalBridge['updater'],
    };

    TestBed.configureTestingModule({
      imports: [ServerDialogComponent],
      providers: [
        DesktopI18nService,
        { provide: KONVOEZ_LOCAL_BRIDGE, useValue: mockBridge },
        { provide: TuiDialogService, useValue: { open: dialogOpen } },
      ],
    });

    fixture = TestBed.createComponent(ServerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const button = (selector: string): HTMLButtonElement => {
    const found = (fixture.nativeElement as HTMLElement).querySelector(
      selector,
    );
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error(`Missing button ${selector}`);
    }
    return found;
  };

  const connectButton = (): HTMLButtonElement => {
    const found = (fixture.nativeElement as HTMLElement).querySelector(
      'button[actions]',
    );
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error('Missing connect button');
    }
    return found;
  };

  it('loads initial origin and submits on connect button click', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.serverUrl()).toBe('https://initial.konvoez.com');

    const onDone = vi.fn();
    component.done.subscribe(onDone);

    connectButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBridge.server.saveServer).toHaveBeenCalledWith(
      'https://initial.konvoez.com',
    );
    expect(onDone).toHaveBeenCalledWith({ origin: 'https://saved.org' });
    expect(component.savedServers()).toEqual([]);
  });

  it('INSECURE maps to server.errorInsecure', async () => {
    setup({ saveServerResult: Promise.reject(new Error('INSECURE')) });
    await component.ngOnInit();
    fixture.detectChanges();

    connectButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()).toBe(
      'HTTPS is required (HTTP allowed for localhost only)',
    );
  });

  it('HTTP_500 maps to server.errorUnreachable', async () => {
    setup({ saveServerResult: Promise.reject(new Error('HTTP_500')) });
    await component.ngOnInit();
    fixture.detectChanges();

    connectButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()).toBe('Unable to connect to server');
  });

  it('Enter key triggers connect', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    const onDone = vi.fn();
    component.done.subscribe(onDone);

    const input = (fixture.nativeElement as HTMLElement).querySelector('input');
    input?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBridge.server.saveServer).toHaveBeenCalledWith(
      'https://initial.konvoez.com',
    );
  });

  it('stores a trimmed address once at the top of the list', async () => {
    setup({ saved: ['https://old.example'] });
    await component.ngOnInit();
    component.serverUrl.set('  https://new.example  ');
    fixture.detectChanges();

    button('.server-row button').click();
    fixture.detectChanges();

    expect(component.savedServers()).toEqual([
      'https://new.example',
      'https://old.example',
    ]);
    expect(mockBridge.server.saveServer).not.toHaveBeenCalled();

    button('.server-row button').click();
    expect(component.savedServers()).toEqual([
      'https://new.example',
      'https://old.example',
    ]);

    component.serverUrl.set('   ');
    fixture.detectChanges();
    expect(button('.server-row button').disabled).toBe(true);
  });

  it('keeps the address when removal is declined', async () => {
    setup({ saved: ['https://keep.example'], confirm: false });
    await component.ngOnInit();
    fixture.detectChanges();

    button('.saved-server button[appearance="negative"]').click();

    expect(dialogOpen).toHaveBeenCalledWith(
      TUI_CONFIRM,
      expect.objectContaining({
        label: 'Remove this server?',
        data: expect.objectContaining({ appearance: 'negative' }),
      }),
    );
    expect(component.savedServers()).toEqual(['https://keep.example']);
  });

  it('removes the address after confirmation', async () => {
    setup({
      saved: ['https://drop.example', 'https://keep.example'],
      confirm: true,
    });
    await component.ngOnInit();
    fixture.detectChanges();

    button('.saved-server button[appearance="negative"]').click();
    fixture.detectChanges();

    expect(component.savedServers()).toEqual(['https://keep.example']);
    expect(localStorage.getItem('konvoez.savedServers')).toBe(
      JSON.stringify(['https://keep.example']),
    );
  });

  it('joins a saved address without changing the list', async () => {
    setup({ saved: ['https://saved.example'] });
    await component.ngOnInit();
    fixture.detectChanges();

    const onDone = vi.fn();
    component.done.subscribe(onDone);

    button('.saved-server button[appearance="primary"]').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBridge.server.saveServer).toHaveBeenCalledWith(
      'https://saved.example',
    );
    expect(onDone).toHaveBeenCalledWith({ origin: 'https://saved.org' });
    expect(component.savedServers()).toEqual(['https://saved.example']);
  });
});
