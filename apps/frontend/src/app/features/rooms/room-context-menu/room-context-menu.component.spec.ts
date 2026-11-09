import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomContextMenuComponent } from './room-context-menu.component';

describe('RoomContextMenuComponent', () => {
  let fixture: ComponentFixture<RoomContextMenuComponent>;
  let component: RoomContextMenuComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomContextMenuComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomContextMenuComponent);
    fixture.componentRef.setInput('roomName', 'general');
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit details, edit and delete', () => {
    const details = vi.fn();
    const edit = vi.fn();
    const deleteFn = vi.fn();
    component.details.subscribe(details);
    component.edit.subscribe(edit);
    component.delete.subscribe(deleteFn);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(3);
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();

    expect(details).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledOnce();
    expect(deleteFn).toHaveBeenCalledOnce();
  });

  it('should hide edit and delete when canManage is false', () => {
    fixture.componentRef.setInput('canManage', false);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
  });
});
