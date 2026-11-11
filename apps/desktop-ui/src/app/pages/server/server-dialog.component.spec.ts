import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { ServerDialogComponent } from './server-dialog.component';

describe('ServerDialogComponent', () => {
  let fixture: ComponentFixture<ServerDialogComponent>;
  let component: ServerDialogComponent;
  let mockBridge: IKonvoezLocalBridge;

  const setup = (saveServerResult?: Promise<{ origin: string }>) => {
    mockBridge = {
      server: {
        getInitial: vi.fn().mockResolvedValue({
          serverOrigin: 'https://initial.konvoez.com',
          locale: 'en',
        }),
        saveServer: vi.fn().mockImplementation(
          () =>
            saveServerResult ??
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
      ],
    });

    fixture = TestBed.createComponent(ServerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('loads initial origin and submits on connect button click', async () => {
    setup();
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.serverUrl()).toBe('https://initial.konvoez.com');

    const onDone = vi.fn();
    component.done.subscribe(onDone);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBridge.server.saveServer).toHaveBeenCalledWith(
      'https://initial.konvoez.com',
    );
    expect(onDone).toHaveBeenCalledWith({ origin: 'https://saved.org' });
  });

  it('INSECURE maps to server.errorInsecure', async () => {
    setup(Promise.reject(new Error('INSECURE')));
    await component.ngOnInit();
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()).toBe(
      'HTTPS is required (HTTP allowed for localhost only)',
    );
  });

  it('HTTP_500 maps to server.errorUnreachable', async () => {
    setup(Promise.reject(new Error('HTTP_500')));
    await component.ngOnInit();
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    ) as HTMLButtonElement;
    button.click();
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
});
