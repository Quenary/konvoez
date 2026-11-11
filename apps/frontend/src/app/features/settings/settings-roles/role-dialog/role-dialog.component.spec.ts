import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import {
  TUI_OPTIONS,
  TuiDialogContext,
  TuiNotificationService,
} from '@taiga-ui/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { EPermission, IRole } from '@konvoez/shared';
import { RolesApiService } from '@core/api/roles-api.service';
import { RoleDialogComponent } from './role-dialog.component';

describe('RoleDialogComponent', () => {
  let component: RoleDialogComponent;
  let fixture: ComponentFixture<RoleDialogComponent>;

  const mockRolesApiService = {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  const mockResponsiveDialogService = {
    open: vi.fn().mockReturnValue(of(false)),
  };

  const existingRole: IRole = {
    id: 5,
    name: 'Moderator',
    color: '#3b82f6',
    priority: 10,
    isDefault: false,
    mentionable: true,
    permissions: [EPermission.MANAGE_ROOMS],
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockDialogContext: Partial<
    TuiDialogContext<IRole | null, IRole | null>
  > = {
    data: existingRole,
    completeWith: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [RoleDialogComponent],
      providers: [
        {
          provide: TUI_OPTIONS,
          useValue: {
            apis: 'stable',
            fontScaling: false,
            scrollbars: 'native',
          },
        },
        provideTranslateService(),
        { provide: RolesApiService, useValue: mockRolesApiService },
        {
          provide: TuiResponsiveDialogService,
          useValue: mockResponsiveDialogService,
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue(of(undefined)) },
        },
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockDialogContext },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoleDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('initializes form with existing role data', () => {
    expect(component['form'].controls.name.value).toBe('Moderator');
    expect(component['form'].controls.color.value).toBe('#3b82f6');
    expect(component['form'].controls.isDefault.value).toBe(false);
    expect(component['form'].controls.mentionable.value).toBe(true);
    expect(
      component['selectedPermissions']().has(EPermission.MANAGE_ROOMS),
    ).toBe(true);
    expect(
      component['availablePermissions'].some(
        (p) => p.permission === EPermission.MENTION_EVERYONE,
      ),
    ).toBe(true);
    expect(
      component['availablePermissions'].some(
        (p) => p.permission === EPermission.MOVE_MEMBERS,
      ),
    ).toBe(true);
  });

  it('renders interactive permission checkboxes with ngModel', async () => {
    const checkboxes = fixture.nativeElement.querySelectorAll(
      '.permissions-grid input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;

    expect(checkboxes.length).toBeGreaterThan(0);
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(false);
    }

    // Toggle SEND_MESSAGES
    const sendMsgIndex = component['availablePermissions'].findIndex(
      (p) => p.permission === EPermission.SEND_MESSAGES,
    );
    expect(sendMsgIndex).toBeGreaterThanOrEqual(0);

    expect(checkboxes[sendMsgIndex].checked).toBe(false);
    checkboxes[sendMsgIndex].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      component['selectedPermissions']().has(EPermission.SEND_MESSAGES),
    ).toBe(true);
  });

  it('submits updated role data on save', () => {
    mockRolesApiService.update.mockReturnValue(of(existingRole));

    component['form'].controls.name.setValue('Super Moderator');
    component['form'].controls.mentionable.setValue(false);
    component['onSubmit']();

    expect(mockRolesApiService.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        name: 'Super Moderator',
        color: '#3b82f6',
        isDefault: false,
        mentionable: false,
      }),
    );
    expect(mockDialogContext.completeWith).toHaveBeenCalledWith(existingRole);
  });

  it('completes with null on close', () => {
    component['close']();
    expect(mockDialogContext.completeWith).toHaveBeenCalledWith(null);
  });

  it('shows a delete button for a custom role', () => {
    const footer = fixture.nativeElement.querySelector('footer');

    expect(footer?.textContent).toContain('GENERAL.DELETE');
  });

  it('deletes a custom role after confirmation and closes the dialog', () => {
    mockRolesApiService.remove.mockReturnValue(of(undefined));
    mockResponsiveDialogService.open.mockReturnValue(of(true));

    component['deleteRole']();

    expect(mockRolesApiService.remove).toHaveBeenCalledWith(existingRole.id);
    expect(mockDialogContext.completeWith).toHaveBeenCalledWith(null);
  });
});

describe('RoleDialogComponent default role', () => {
  const defaultRole: IRole = {
    id: 2,
    name: 'User',
    color: null,
    priority: 0,
    isDefault: true,
    mentionable: false,
    permissions: [EPermission.SEND_MESSAGES],
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [RoleDialogComponent],
      providers: [
        {
          provide: TUI_OPTIONS,
          useValue: {
            apis: 'stable',
            fontScaling: false,
            scrollbars: 'native',
          },
        },
        provideTranslateService(),
        {
          provide: RolesApiService,
          useValue: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
        },
        {
          provide: TuiResponsiveDialogService,
          useValue: { open: vi.fn().mockReturnValue(of(false)) },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue(of(undefined)) },
        },
        {
          provide: POLYMORPHEUS_CONTEXT,
          useValue: { data: defaultRole, completeWith: vi.fn() },
        },
      ],
    }).compileComponents();
  });

  it('does not offer deletion of a default role', async () => {
    const fixture = TestBed.createComponent(RoleDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('footer')?.textContent,
    ).not.toContain('GENERAL.DELETE');
  });
});
