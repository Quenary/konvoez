import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { EUserRole, IUser } from '@konvoez/shared';
import { DayjsPipe } from '@shared/pipes/dayjs.pipe';
import { SettingsUserManagementComponent } from './settings-user-management.component';
import { UserManagementApiService } from './user-management-api.service';

describe('SettingsUserManagementComponent', () => {
  let fixture: ComponentFixture<SettingsUserManagementComponent>;

  const mockApi = {
    list: vi.fn(),
  };

  const sampleUser: IUser = {
    id: 5,
    username: 'alice',
    fullname: 'Alice Wonderland',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-02T03:04:00.000Z'),
    updatedAt: null,
  };

  const setup = async (users: IUser[] = []) => {
    mockApi.list.mockReturnValue(of(users));

    await TestBed.configureTestingModule({
      imports: [SettingsUserManagementComponent],
      providers: [
        provideTranslateService(),
        { provide: UserManagementApiService, useValue: mockApi },
        {
          provide: TuiDialogService,
          useValue: { open: vi.fn().mockReturnValue(of(null)) },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue(of(undefined)) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsUserManagementComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render an empty row when there are no users', async () => {
    await setup([]);
    const compiled = fixture.nativeElement as HTMLElement;
    const emptyCell = compiled.querySelector('.empty-cell');

    expect(emptyCell).not.toBeNull();
    expect(emptyCell?.textContent).toContain('SETTINGS.USERS.NO_USERS');
  });

  it('should render username, email, and created date', async () => {
    await setup([sampleUser]);
    const compiled = fixture.nativeElement as HTMLElement;
    const expectedCreatedAt = new DayjsPipe().transform(sampleUser.createdAt);

    expect(compiled.querySelector('.empty-cell')).toBeNull();
    expect(compiled.textContent).toContain('alice');
    expect(compiled.textContent).toContain('alice@example.com');
    expect(compiled.textContent).toContain(expectedCreatedAt);
  });
});
