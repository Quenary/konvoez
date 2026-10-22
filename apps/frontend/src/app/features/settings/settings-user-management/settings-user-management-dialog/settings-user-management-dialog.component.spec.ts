import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TuiDialogContext, TuiNotificationService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { IUser, IRole } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { UserManagementApiService } from '@core/api/user-management-api.service';
import { RolesApiService } from '@core/api/roles-api.service';
import {
  IUserManagementDialogData,
  SettingsUserManagementDialogComponent,
} from './settings-user-management-dialog.component';

describe('SettingsUserManagementDialogComponent', () => {
  let component: SettingsUserManagementDialogComponent;
  let fixture: ComponentFixture<SettingsUserManagementDialogComponent>;
  let store: MockStore;

  const mockUserManagementApiService = {
    get: vi.fn(),
    update: vi.fn(),
    anonymize: vi.fn(),
    remove: vi.fn(),
  };

  const mockRolesApiService = {
    list: vi.fn(),
  };

  const mockDialogService = {
    open: vi.fn().mockReturnValue(of(null)),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue(of(undefined)),
  };

  const mockDialogContext: Partial<
    TuiDialogContext<boolean, IUserManagementDialogData>
  > = {
    data: { id: 2 },
    completeWith: vi.fn(),
  };

  const meUser: IUser = {
    id: 1,
    username: 'owner',
    fullname: 'Owner User',
    email: 'owner@example.com',
    isOwner: true,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const targetUser: IUser = {
    id: 2,
    username: 'bob',
    fullname: 'Bob Smith',
    email: 'bob@example.com',
    isOwner: false,
    roles: [
      {
        id: 10,
        name: 'Moderator',
        priority: 1,
        color: '#3b82f6',
        mentionable: false,
      },
    ],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const rolesList: IRole[] = [
    {
      id: 10,
      name: 'Moderator',
      priority: 1,
      color: '#3b82f6',
      isDefault: false,
      mentionable: false,
      permissions: [],
      createdAt: new Date(),
      updatedAt: null,
    },
    {
      id: 20,
      name: 'VIP',
      priority: 2,
      color: null,
      isDefault: false,
      mentionable: false,
      permissions: [],
      createdAt: new Date(),
      updatedAt: null,
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUserManagementApiService.get.mockReturnValue(of(targetUser));
    mockRolesApiService.list.mockReturnValue(of(rolesList));

    await TestBed.configureTestingModule({
      imports: [SettingsUserManagementDialogComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: meUser }],
        }),
        {
          provide: UserManagementApiService,
          useValue: mockUserManagementApiService,
        },
        { provide: RolesApiService, useValue: mockRolesApiService },
        {
          provide: TuiResponsiveDialogService,
          useValue: mockDialogService,
        },
        { provide: TuiNotificationService, useValue: mockNotificationService },
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockDialogContext },
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(SettingsUserManagementDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    store.resetSelectors();
  });

  it('allows managing regular user when logged in as owner', () => {
    expect(component['canManage']()).toBe(true);
  });

  it('forbids managing owner user', () => {
    const ownerTarget: IUser = { ...targetUser, isOwner: true };
    mockUserManagementApiService.get.mockReturnValue(of(ownerTarget));
    component['userResource'].reload();
    fixture.detectChanges();

    expect(component['canManage']()).toBe(false);
  });

  it('forbids managing self', () => {
    store.overrideSelector(selectCurrentUser, targetUser);
    store.refreshState();
    fixture.detectChanges();

    expect(component['canManage']()).toBe(false);
  });

  it('detects role selection changes and saves updated roleIds', () => {
    mockUserManagementApiService.update.mockReturnValue(of(targetUser));

    expect(component['roleChanged']()).toBe(false);

    component['toggleRole'](20, true);
    expect(component['roleChanged']()).toBe(true);

    component['saveRole']();
    expect(mockUserManagementApiService.update).toHaveBeenCalledWith(2, {
      roleIds: expect.arrayContaining([10, 20]),
    });
  });

  it('renders interactive role checkboxes with ngModel', async () => {
    const checkboxes = fixture.nativeElement.querySelectorAll(
      '.roles-checklist input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;

    expect(checkboxes.length).toBe(2);
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(false);
    }
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);

    checkboxes[1].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['roleChanged']()).toBe(true);
    expect(component['selectedRoleIds']().has(20)).toBe(true);
  });
});
