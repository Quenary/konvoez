import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogContext, TuiNotificationService } from '@taiga-ui/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { ERoomType } from '@konvoez/shared';
import { RoomsApiService } from '@core/api/rooms-api.service';
import { RolesApiService } from '@core/api/roles-api.service';
import { UsersStore } from '@core/stores/users.store';
import { RoomDialogComponent, RoomDialogData } from './room-dialog.component';

describe('RoomDialogComponent', () => {
  let component: RoomDialogComponent;
  let fixture: ComponentFixture<RoomDialogComponent>;

  const mockRoomsApiService = {
    avatarUpload: vi.fn(),
  };

  const mockRolesApiService = {
    list: vi.fn().mockReturnValue(of([])),
  };

  const mockUsersStore = {
    entities: vi.fn().mockReturnValue([]),
    loadAll: vi.fn(),
  };

  const mockDialogContext: Partial<
    TuiDialogContext<RoomDialogData | null, RoomDialogData>
  > = {
    data: {
      id: 1,
      name: 'Secret Lounge',
      type: ERoomType.TEXT,
      isPrivate: true,
      allowedRoleIds: [10],
      allowedUserIds: [2],
    },
    completeWith: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [RoomDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: RoomsApiService, useValue: mockRoomsApiService },
        { provide: RolesApiService, useValue: mockRolesApiService },
        { provide: UsersStore, useValue: mockUsersStore },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue(of(undefined)) },
        },
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockDialogContext },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('initializes form with private room data', () => {
    expect(component['form'].controls.name.value).toBe('Secret Lounge');
    expect(component['form'].controls.isPrivate.value).toBe(true);
    expect(component['isRoleSelected'](10)).toBe(true);
    expect(component['isUserSelected'](2)).toBe(true);
  });

  it('submits updated room data including private access', () => {
    component['toggleRole'](20, true);
    component.submit();

    expect(mockDialogContext.completeWith).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Secret Lounge',
        isPrivate: true,
        allowedRoleIds: expect.arrayContaining([10, 20]),
        allowedUserIds: [2],
      }),
    );
  });

  it('completes with null on close', () => {
    component.close();
    expect(mockDialogContext.completeWith).toHaveBeenCalledWith(null);
  });
});
