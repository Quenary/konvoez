/** @vitest-environment jsdom */
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalLinkService } from './external-link.service';

function clickOnAnchor(
  anchor: HTMLAnchorElement,
  init?: MouseEventInit,
): MouseEvent {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  Object.defineProperty(event, 'target', { value: anchor });
  return event;
}

describe('ExternalLinkService', () => {
  let dialogService: { open: ReturnType<typeof vi.fn> };
  let service: ExternalLinkService;

  beforeEach(() => {
    dialogService = {
      open: vi.fn(() => of(false)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: TuiResponsiveDialogService, useValue: dialogService },
      ],
    });

    service = TestBed.inject(ExternalLinkService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('opens confirm dialog and opens external link when confirmed', () => {
    dialogService.open.mockReturnValue(of(true));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    root.append(anchor);

    const event = clickOnAnchor(anchor);
    service.handleHtmlContentClick(event, { root });
    expect(event.defaultPrevented).toBe(true);
    expect(dialogService.open).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      'https://example.com/',
      '_blank',
      'noopener,noreferrer',
    );

    open.mockRestore();
  });

  it('does not open a new tab when the user cancels', () => {
    dialogService.open.mockReturnValue(of(false));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    root.append(anchor);

    service.handleHtmlContentClick(clickOnAnchor(anchor), { root });

    expect(dialogService.open).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();

    open.mockRestore();
  });

  it('ignores hash-only links', () => {
    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = '#section';
    root.append(anchor);

    const event = clickOnAnchor(anchor);
    service.handleHtmlContentClick(event, { root });
    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it('does not intercept same-origin links', () => {
    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = '/rooms';
    root.append(anchor);

    const event = clickOnAnchor(anchor);
    service.handleHtmlContentClick(event, { root });
    expect(event.defaultPrevented).toBe(false);
    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it('does not intercept mailto links', () => {
    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = 'mailto:test@example.com';
    root.append(anchor);

    const event = clickOnAnchor(anchor);
    service.handleHtmlContentClick(event, { root });
    expect(event.defaultPrevented).toBe(false);
    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it('does not intercept middle click', () => {
    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    root.append(anchor);

    const event = new MouseEvent('auxclick', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    Object.defineProperty(event, 'target', { value: anchor });

    service.handleHtmlContentClick(event, { root });
    expect(event.defaultPrevented).toBe(false);
    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it('does not intercept clicks with modifier keys', () => {
    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    root.append(anchor);

    const event = clickOnAnchor(anchor, { ctrlKey: true });
    service.handleHtmlContentClick(event, { root });
    expect(event.defaultPrevented).toBe(false);
    expect(dialogService.open).not.toHaveBeenCalled();
  });
});
