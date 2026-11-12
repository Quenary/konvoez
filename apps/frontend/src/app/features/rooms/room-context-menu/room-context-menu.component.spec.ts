import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ERoomType, IRoom } from '@konvoez/shared';
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

  beforeEach(async () => {
    vi.clearAllMocks();
    canManageRooms.set(true);

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

  it('triggers editRoom and emits closeMenu on edit click', async () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    await buttons[1].click();

    expect(editRoom).toHaveBeenCalledWith(mockRoom);
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('triggers deleteRoom and emits closeMenu on delete click', () => {
    const closeSpy = vi.fn();
    component.closeMenu.subscribe(closeSpy);

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons[2].style.color).toBe('var(--tui-status-negative)');
    buttons[2].click();

    expect(deleteRoom).toHaveBeenCalledWith(mockRoom);
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('should hide edit and delete when canManage is false', () => {
    canManageRooms.set(false);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button[tuiOption]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('ROOMS.DETAILS');
  });
});
