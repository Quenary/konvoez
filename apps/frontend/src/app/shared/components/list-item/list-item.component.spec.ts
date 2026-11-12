import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListItemComponent } from './list-item.component';

@Component({
  template: '',
})
class ListItemDestinationComponent {}

@Component({
  imports: [ListItemComponent],
  template: `
    <app-list-item [link]="link()">
      <span
        listItemLeading
        class="leading">
        Lead
      </span>
      Label
    </app-list-item>
  `,
})
class ListItemHostComponent {
  public readonly link = signal<string | null>('/settings/profile');
}

describe('ListItemComponent', () => {
  let fixture: ComponentFixture<ListItemHostComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListItemHostComponent],
      providers: [
        provideRouter([
          {
            path: 'settings/profile',
            component: ListItemDestinationComponent,
          },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ListItemHostComponent);
    fixture.detectChanges();
  });

  it('projects the leading slot and renders a trailing chevron', () => {
    const el: HTMLElement = fixture.nativeElement;
    const icon = el.querySelector('tui-icon');
    expect(el.querySelector('.leading')?.textContent).toContain('Lead');
    expect(el.textContent).toContain('Label');
    expect(icon?.getAttribute('style')).toContain('chevron-right');
  });

  it('navigates when link is set', async () => {
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('button');
    button.click();
    await fixture.whenStable();

    expect(router.url).toBe('/settings/profile');
  });

  it('does not navigate when link is empty', async () => {
    fixture.componentInstance.link.set(null);
    fixture.detectChanges();

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('button');
    button.click();
    await fixture.whenStable();

    expect(router.url).toBe('/');
  });
});
