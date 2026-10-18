import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { EPermission, IRole } from '@konvoez/shared';
import { SettingsRolesComponent } from './settings-roles.component';
import { RolesApiService } from '@core/api/roles-api.service';

describe('SettingsRolesComponent', () => {
  let component: SettingsRolesComponent;
  let fixture: ComponentFixture<SettingsRolesComponent>;

  const mockRolesApiService = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  const mockDialogService = {
    open: vi.fn().mockReturnValue(of(null)),
  };

  const mockResponsiveDialogService = {
    open: vi.fn().mockReturnValue(of(true)),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue(of(undefined)),
  };

  const sampleRole: IRole = {
    id: 1,
    name: 'Moderator',
    color: '#3b82f6',
    priority: 10,
    isDefault: false,
    permissions: [EPermission.MANAGE_ROOMS, EPermission.MODERATE_MESSAGES],
    createdAt: new Date(),
    updatedAt: null,
  };

  const defaultRole: IRole = {
    id: 2,
    name: 'User',
    color: null,
    priority: 0,
    isDefault: true,
    permissions: [EPermission.SEND_MESSAGES, EPermission.CONNECT_VOICE],
    createdAt: new Date(),
    updatedAt: null,
  };

  const setupTestBed = async (roles: IRole[] = []) => {
    mockRolesApiService.list.mockReturnValue(of(roles));

    await TestBed.configureTestingModule({
      imports: [SettingsRolesComponent],
      providers: [
        provideTranslateService(),
        { provide: RolesApiService, useValue: mockRolesApiService },
        { provide: TuiDialogService, useValue: mockDialogService },
        {
          provide: TuiResponsiveDialogService,
          useValue: mockResponsiveDialogService,
        },
        { provide: TuiNotificationService, useValue: mockNotificationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsRolesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty table message when there are no roles', async () => {
    await setupTestBed([]);
    const compiled = fixture.nativeElement as HTMLElement;
    const emptyCell = compiled.querySelector('.empty-cell');

    expect(emptyCell).not.toBeNull();
    expect(emptyCell?.textContent).toContain('SETTINGS.ROLES.NO_ROLES');
  });

  it('renders role rows when roles are loaded', async () => {
    await setupTestBed([sampleRole, defaultRole]);
    const compiled = fixture.nativeElement as HTMLElement;
    const tableRows = compiled.querySelectorAll('tbody tr');

    expect(tableRows.length).toBe(2);
    expect(compiled.textContent).toContain('Moderator');
    expect(compiled.textContent).toContain('User');
  });

  it('opens create dialog when openCreateDialog is called', async () => {
    await setupTestBed([]);
    await component['openCreateDialog']();

    expect(mockDialogService.open).toHaveBeenCalled();
  });

  it('opens edit dialog when openEditDialog is called', async () => {
    await setupTestBed([sampleRole]);
    await component['openEditDialog'](sampleRole);

    expect(mockDialogService.open).toHaveBeenCalled();
  });

  it('prevents deleting a default role', async () => {
    await setupTestBed([defaultRole]);
    component['deleteRole'](defaultRole);

    expect(mockNotificationService.open).toHaveBeenCalled();
    expect(mockRolesApiService.remove).not.toHaveBeenCalled();
  });

  it('deletes custom role after confirmation', async () => {
    mockRolesApiService.remove.mockReturnValue(of(undefined));
    await setupTestBed([sampleRole]);

    component['deleteRole'](sampleRole);

    expect(mockResponsiveDialogService.open).toHaveBeenCalled();
    expect(mockRolesApiService.remove).toHaveBeenCalledWith(sampleRole.id);
  });
});
