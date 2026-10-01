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

  it('should emit edit and delete', () => {
    const edit = vi.fn();
    const deleteFn = vi.fn();
    component.edit.subscribe(edit);
    component.delete.subscribe(deleteFn);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    buttons[0].click();
    buttons[1].click();

    expect(edit).toHaveBeenCalledOnce();
    expect(deleteFn).toHaveBeenCalledOnce();
  });
});
