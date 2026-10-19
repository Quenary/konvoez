import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogContext, TuiNotificationService } from '@taiga-ui/core';
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

    await TestBed.configureTestingModule({
      imports: [RoleDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: RolesApiService, useValue: mockRolesApiService },
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
});
