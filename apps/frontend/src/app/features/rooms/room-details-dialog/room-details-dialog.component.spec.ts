import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { ERoomType, IRoom } from '@konvoez/shared';
import { RoomManageService } from '../room-manage.service';
import { AttachmentsApiService } from '@core/chat/outgoing/attachments-api.service';
import { of } from 'rxjs';
import { RoomDetailsDialogComponent } from './room-details-dialog.component';

describe('RoomDetailsDialogComponent', () => {
  let fixture: ComponentFixture<RoomDetailsDialogComponent>;
  let component: RoomDetailsDialogComponent;

  const completeWith = vi.fn();
  const mockRouter = {
    navigate: vi.fn(),
  };
  const mockRoomManageService = {
    canManageRooms: vi.fn().mockReturnValue(true),
    editRoom: vi.fn(),
    deleteRoom: vi.fn(),
  };
  const mockAttachmentsApiService = {
    getCounts: vi
      .fn()
      .mockReturnValue(of({ image: 0, video: 0, audio: 0, file: 0 })),
    listMedia: vi
      .fn()
      .mockReturnValue(of({ items: [], nextCursor: null, hasMore: false })),
  };

  const sampleRoom: IRoom = {
    id: 1,
    name: 'General Text',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: 'https://example.com/avatar.png',
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    author: { id: 1, username: 'owner', fullname: 'Owner User' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const sampleVoiceRoom: IRoom = {
    ...sampleRoom,
    id: 2,
    name: 'Voice Lounge',
    type: ERoomType.VOICE,
  };

  async function createComponent(room: IRoom) {
    completeWith.mockClear();
    mockRouter.navigate.mockClear();
    mockRoomManageService.editRoom.mockClear();
    mockRoomManageService.deleteRoom.mockClear();

    await TestBed.configureTestingModule({
      imports: [RoomDetailsDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: Router, useValue: mockRouter },
        { provide: RoomManageService, useValue: mockRoomManageService },
        { provide: AttachmentsApiService, useValue: mockAttachmentsApiService },
        {
          provide: POLYMORPHEUS_CONTEXT,
          useValue: {
            data: room,
            completeWith,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomDetailsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('with Text Room', () => {
    beforeEach(async () => {
      await createComponent(sampleRoom);
    });

    it('renders room title and icon actions', () => {
      expect(fixture.nativeElement.textContent).toContain('General Text');
      expect(component['isMediaVisible']).toBe(true);
      expect(component['canManage']()).toBe(true);

      const [editButton, deleteButton] = fixture.nativeElement.querySelectorAll(
        '.room-details-actions button',
      ) as NodeListOf<HTMLButtonElement>;
      expect(editButton.getAttribute('aria-label')).toBe('GENERAL.EDIT');
      expect(deleteButton.getAttribute('aria-label')).toBe('GENERAL.DELETE');
      expect(deleteButton.getAttribute('appearance')).toBe('negative');
    });

    it('triggers editRoom on edit action and closes dialog', () => {
      component['editRoom']();
      expect(completeWith).toHaveBeenCalled();
      expect(mockRoomManageService.editRoom).toHaveBeenCalledWith(sampleRoom);
    });

    it('triggers deleteRoom on delete action and closes dialog', () => {
      component['deleteRoom']();
      expect(completeWith).toHaveBeenCalled();
      expect(mockRoomManageService.deleteRoom).toHaveBeenCalledWith(sampleRoom);
    });

    it('navigates to message on onGoToMessage', () => {
      component['onGoToMessage']('msg-123');
      expect(completeWith).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/text-room', 1], {
        queryParams: { message: 'msg-123' },
      });
    });
  });

  describe('with Voice Room', () => {
    beforeEach(async () => {
      await createComponent(sampleVoiceRoom);
    });

    it('hides media section for voice rooms', () => {
      expect(component['isMediaVisible']).toBe(false);
      expect(
        fixture.nativeElement.querySelector('app-media-gallery'),
      ).toBeNull();
    });
  });
});
