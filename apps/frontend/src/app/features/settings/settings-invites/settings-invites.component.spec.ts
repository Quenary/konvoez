import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { IInvite } from '@konvoez/shared';
import { SettingsInvitesComponent } from './settings-invites.component';
import { InvitesApiService } from './invites-api.service';

describe('SettingsInvitesComponent', () => {
  let component: SettingsInvitesComponent;
  let fixture: ComponentFixture<SettingsInvitesComponent>;

  const mockInvitesApiService = {
    list: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    delete: vi.fn(),
  };

  const mockDialogService = {
    open: vi.fn().mockReturnValue(of(null)),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue(of(undefined)),
  };

  const sampleInvite: IInvite = {
    id: 1,
    code: 'abcd1234efgh5678',
    email: 'test@example.com',
    status: 'active',
    author: { id: 10, username: 'admin', fullname: 'Administrator' },
    expiresAt: new Date(Date.now() + 3600000),
    usedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const setupTestBed = async (invites: IInvite[] = []) => {
    mockInvitesApiService.list.mockReturnValue(of(invites));

    await TestBed.configureTestingModule({
      imports: [SettingsInvitesComponent],
      providers: [
        provideTranslateService(),
        { provide: InvitesApiService, useValue: mockInvitesApiService },
        { provide: TuiDialogService, useValue: mockDialogService },
        { provide: TuiNotificationService, useValue: mockNotificationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsInvitesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render empty table row when there are no invites without errors', async () => {
    await setupTestBed([]);
    const compiled = fixture.nativeElement as HTMLElement;
    const emptyCell = compiled.querySelector('.empty-cell');

    expect(emptyCell).not.toBeNull();
    expect(emptyCell?.textContent).toContain('SETTINGS.INVITES.NO_INVITES');
  });

  it('should render invite rows when invites are present', async () => {
    await setupTestBed([sampleInvite]);
    const compiled = fixture.nativeElement as HTMLElement;
    const emptyCell = compiled.querySelector('.empty-cell');
    const tableRows = compiled.querySelectorAll('tbody tr');

    expect(emptyCell).toBeNull();
    expect(tableRows.length).toBe(1);
    expect(compiled.textContent).toContain('test@example.com');
  });

  it('should compute view model with statusData, progress and remaining text correctly', async () => {
    await setupTestBed([sampleInvite]);

    const viewItems = component['invites']();
    expect(viewItems.length).toBe(1);
    const item = viewItems[0];
    expect(item.id).toBe(sampleInvite.id);
    expect(item.email).toBe(sampleInvite.email);
    expect(item.status).toBe('active');
    expect(item.isActive).toBe(true);
    expect(item.statusData.appearance).toBe('positive');
    expect(item.statusData.icon).toBe('@tui.circle-check');
    expect(item.authorUsername).toBe('admin');
    expect(item.usedByUsername).toBeNull();
    expect(item.progress).toBeGreaterThanOrEqual(0);
    expect(item.progress).toBeLessThanOrEqual(100);
    expect(item.progressColor).toBe('var(--tui-status-positive)');
    expect(typeof item.remainingText).toBe('string');
  });

  it('should map usedByUsername when invite was used', async () => {
    const usedInvite: IInvite = {
      ...sampleInvite,
      id: 2,
      status: 'used',
      usedBy: { id: 20, username: 'accepted_user', fullname: 'Accepted User' },
    };
    await setupTestBed([usedInvite]);

    const viewItems = component['invites']();
    expect(viewItems[0].usedByUsername).toBe('accepted_user');
  });

  it('should compute progress color based on remaining thresholds', async () => {
    const now = Date.now();
    const positiveInvite: IInvite = {
      ...sampleInvite,
      id: 1,
      createdAt: new Date(now - 10_000),
      expiresAt: new Date(now + 90_000), // ~90% remaining -> positive
    };
    const warningInvite: IInvite = {
      ...sampleInvite,
      id: 2,
      createdAt: new Date(now - 60_000),
      expiresAt: new Date(now + 40_000), // ~40% remaining -> warning
    };
    const negativeInvite: IInvite = {
      ...sampleInvite,
      id: 3,
      createdAt: new Date(now - 90_000),
      expiresAt: new Date(now + 10_000), // ~10% remaining -> negative
    };

    await setupTestBed([positiveInvite, warningInvite, negativeInvite]);

    const items = component['invites']();
    expect(items[0].progressColor).toBe('var(--tui-status-positive)');
    expect(items[1].progressColor).toBe('var(--tui-status-warning)');
    expect(items[2].progressColor).toBe('var(--tui-status-negative)');
  });

  it('should open create dialog when openCreateDialog is called', async () => {
    await setupTestBed([]);

    await component['openCreateDialog']();

    expect(mockDialogService.open).toHaveBeenCalled();
  });

  it('should call revoke on invitesApiService when revoke is called', async () => {
    mockInvitesApiService.revoke.mockReturnValue(
      of({ ...sampleInvite, status: 'revoked' }),
    );
    await setupTestBed([sampleInvite]);

    component['revoke'](1);

    expect(mockInvitesApiService.revoke).toHaveBeenCalledWith(1);
  });

  it('should call delete on invitesApiService when delete is called', async () => {
    mockInvitesApiService.delete.mockReturnValue(of(undefined));
    await setupTestBed([sampleInvite]);

    component['delete'](1);

    expect(mockInvitesApiService.delete).toHaveBeenCalledWith(1);
  });
});
