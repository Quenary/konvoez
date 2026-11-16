import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ERoomType, IRoom } from '@konvoez/shared';
import { RoomsStore } from '@core/stores/rooms.store';
import { RoomManageService } from '../room-manage.service';
import { RoomContextMenuComponent } from './room-context-menu.component';

describe('RoomContextMenuComponent', () => {
  let fixture: ComponentFixture<RoomContextMenuComponent>;
  let component: RoomContextMenuComponent;

  const mockRoom: IRoom = {
    id: 1,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    order: 0,
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const canManageRooms = signal(true);
  const openRoomDetails = vi.fn().mockResolvedValue(undefined);
  const editRoom = vi.fn().mockResolvedValue(undefined);
  const deleteRoom = vi.fn();
  const moveRoom = vi.fn();
  const textRooms = signal<IRoom[]>([
    mockRoom,
    { ...mockRoom, id: 2, name: 'random', order: 1 },
  ]);
  const voiceRooms = signal<IRoom[]>([]);

  beforeEach(async () => {
    vi.clearAllMocks();
    canManageRooms.set(true);
    textRooms.set([mockRoom, { ...mockRoom, id: 2, name: 'random', order: 1 }]);
    voiceRooms.set([]);

    await TestBed.configureTestingModule({
      imports: [RoomContextMenuComponent],
      providers: [
        provideTranslateService(),
        {
          provide: RoomManageService,
          useValue: {
            canManageRooms,
            openRoomDetails,
            editRoom,
            deleteRoom,
            moveRoom,
          },
        },
        {
          provide: RoomsStore,
          useValue: {
            textRooms,
            voiceRooms,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomContextMenuComponent);
    fixture.componentRef.setInput('room', mockRoom);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays room name in opt-group label', () => {
    const optGroup = fixture.nativeElement.querySelector('tui-opt-group');
    expect(optGroup?.getAttribute('data-label')).toBe('general');
  });

  it('triggers openRoomDetails and emits closeMenu on details click', () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    buttons[0].click();

    expect(openRoomDetails).toHaveBeenCalledWith(mockRoom);
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('disables move up for first item and enables move down', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[2].disabled).toBe(false);
  });

  it('triggers moveRoom down and emits closeMenu on move down click', () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    buttons[2].click();

    expect(moveRoom).toHaveBeenCalledWith(mockRoom, 'down');
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('triggers moveRoom up when not first', () => {
    textRooms.set([{ ...mockRoom, id: 0, name: 'first', order: 0 }, mockRoom]);
    fixture.detectChanges();

    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(true);
    buttons[1].click();

    expect(moveRoom).toHaveBeenCalledWith(mockRoom, 'up');
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('triggers editRoom and emits closeMenu on edit click', async () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    await buttons[3].click();

    expect(editRoom).toHaveBeenCalledWith(mockRoom);
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('triggers deleteRoom and emits closeMenu on delete click', () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons[4].style.color).toBe('var(--tui-status-negative)');
    buttons[4].click();

    expect(deleteRoom).toHaveBeenCalledWith(mockRoom);
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('should hide edit, delete, and move buttons when canManage is false', () => {
    canManageRooms.set(false);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
  });

  it('does not invoke moveRoom when canMoveUp or canMoveDown is false', () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    // mockRoom is at index 0, so canMoveUp is false
    component['onMoveUp']();
    expect(moveRoom).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();

    // Set mockRoom at the end of the list
    textRooms.set([mockRoom]);
    fixture.detectChanges();

    component['onMoveDown']();
    expect(moveRoom).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
