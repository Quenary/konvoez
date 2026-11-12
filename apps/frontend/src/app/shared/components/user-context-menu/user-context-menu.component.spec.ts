import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserContextMenuComponent } from './user-context-menu.component';

describe('UserContextMenuComponent', () => {
  let fixture: ComponentFixture<UserContextMenuComponent>;
  let component: UserContextMenuComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserContextMenuComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(UserContextMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit only details when moderation is hidden', () => {
    const details = vi.fn();
    component.details.subscribe(details);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
    buttons[0].click();
    expect(details).toHaveBeenCalledOnce();
  });

  it('should emit details, move and disconnect', () => {
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
    expect(buttons[2].classList.contains('destructive')).toBe(true);
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();

    expect(details).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith({ id: 2, name: 'lounge' });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('should hide move targets when the list is empty', () => {
    fixture.componentRef.setInput('canModerate', true);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
    expect(buttons[1].textContent).toContain('VOICE.DISCONNECT_FROM_VOICE');
    expect(fixture.nativeElement.querySelector('tui-opt-group')).toBeNull();
  });
});
