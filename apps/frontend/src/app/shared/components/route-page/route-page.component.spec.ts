import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoutePageComponent } from './route-page.component';

@Component({
  imports: [RoutePageComponent],
  template: `
    <app-route-page>
      <header class="page-header">Title</header>
      <p class="page-body">Content</p>
      <footer class="page-footer">Save</footer>
    </app-route-page>
  `,
})
class RoutePageHostComponent {}

describe('RoutePageComponent', () => {
  let fixture: ComponentFixture<RoutePageHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutePageHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RoutePageHostComponent);
    fixture.detectChanges();
  });

  it('projects the header above the body and the footer below it', () => {
    const el: HTMLElement = fixture.nativeElement;
    const header = el.querySelector('.route-header');
    const body = el.querySelector('.body-content');
    const footer = el.querySelector('.route-footer');

    expect(header?.textContent).toContain('Title');
    expect(body?.textContent).toContain('Content');
    expect(footer?.textContent).toContain('Save');
    expect(header && body && footer).toBeTruthy();
    if (!header || !body || !footer) {
      return;
    }
    expect(
      header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the footer outside the scroll area', () => {
    const scrollbar = fixture.nativeElement.querySelector('tui-scrollbar');

    expect(scrollbar?.textContent).toContain('Content');
    expect(scrollbar?.textContent).not.toContain('Save');
    expect(scrollbar?.textContent).not.toContain('Title');
  });
});
