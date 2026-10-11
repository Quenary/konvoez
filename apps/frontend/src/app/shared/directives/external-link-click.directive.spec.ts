/** @vitest-environment jsdom */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExternalLinkService } from '@core/services/external-link.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalLinkClickDirective } from './external-link-click.directive';

@Component({
  imports: [ExternalLinkClickDirective],
  template: `<div appExternalLinkClick
    ><a href="https://example.com">link</a></div
  >`,
})
class HostComponent {}

describe('ExternalLinkClickDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let handleHtmlContentClick: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    handleHtmlContentClick = vi.fn(() => false);

    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        {
          provide: ExternalLinkService,
          useValue: { handleHtmlContentClick },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('delegates left click to ExternalLinkService with host as root', () => {
    const host = fixture.nativeElement.querySelector(
      '[appExternalLinkClick]',
    ) as HTMLElement;
    const anchor = host.querySelector('a') as HTMLAnchorElement;

    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );

    expect(handleHtmlContentClick).toHaveBeenCalledTimes(1);
    const [event, options] = handleHtmlContentClick.mock.calls[0] as [
      MouseEvent,
      { root: HTMLElement },
    ];
    expect(event.type).toBe('click');
    expect(event.button).toBe(0);
    expect(options.root).toBe(host);
  });
});
