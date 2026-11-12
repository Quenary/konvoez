import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { IInvite } from '@konvoez/shared';
import { SettingsInvitesComponent } from './settings-invites.component';
import { InvitesApiService } from '@core/api/invites-api.service';
import { PublicStore } from '@core/stores/public.store';

describe('SettingsInvitesComponent', () => {
  let component: SettingsInvitesComponent;
  let fixture: ComponentFixture<SettingsInvitesComponent>;

  const mockInvitesApiService = {
    list: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    delete: vi.fn(),
    resend: vi.fn(),
  };

  const mockDialogService = {
    open: vi.fn().mockReturnValue(of(null)),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue(of(undefined)),
  };

  const mockPublicStore = {
    isSmtpConfigured: vi.fn().mockReturnValue(true),
    isAppUrlConfigured: vi.fn().mockReturnValue(true),
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
    emailSent: true,
    emailSentAt: new Date(),
    url: 'https://konvoez.example.com/auth/register?code=abcd1234efgh5678&email=test%40example.com',
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
        {
          provide: TuiResponsiveDialogService,
          useValue: mockDialogService,
        },
        { provide: TuiNotificationService, useValue: mockNotificationService },
        { provide: PublicStore, useValue: mockPublicStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsInvitesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicStore.isSmtpConfigured.mockReturnValue(true);
    mockPublicStore.isAppUrlConfigured.mockReturnValue(true);
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
    expect(item.canCopyLink).toBe(true);
    expect(item.url).toBe(sampleInvite.url);
    expect(item.statusData.appearance).toBe('positive');
    expect(item.statusData.icon).toBe('@tui.circle-check');
    expect(item.authorUsername).toBe('admin');
    expect(item.usedByUsername).toBeNull();
    expect(item.progress).toBeGreaterThanOrEqual(0);
    expect(item.progress).toBeLessThanOrEqual(100);
    expect(item.progressColor).toBe('var(--tui-status-positive)');
    expect(typeof item.remainingText).toBe('string');
  });

  it.each([
    { smtp: true, appUrl: true, expected: true },
    { smtp: false, appUrl: true, expected: false },
    { smtp: true, appUrl: false, expected: false },
  ])(
    'should compute canResendEmail=$expected when smtp=$smtp and appUrl=$appUrl',
    async ({ smtp, appUrl, expected }) => {
      mockPublicStore.isSmtpConfigured.mockReturnValue(smtp);
      mockPublicStore.isAppUrlConfigured.mockReturnValue(appUrl);
      await setupTestBed([sampleInvite]);

      expect(component['invites']()[0].canResendEmail).toBe(expected);
    },
  );

  it.each(['used', 'revoked', 'expired'] as const)(
    'should hide the link when status is %s',
    async (status) => {
      await setupTestBed([
        {
          ...sampleInvite,
          status,
          url: 'https://konvoez.example.com/auth/register?code=secret',
        },
      ]);

      const item = component['invites']()[0];
      expect(item.canCopyLink).toBe(false);
      expect(item.code).toBe('');
      expect(item.url).toBe('');
    },
  );

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

  it('should allow delete on revoked or active invite', async () => {
    mockInvitesApiService.delete.mockReturnValue(of(undefined));
    await setupTestBed([{ ...sampleInvite, status: 'revoked' }]);

    component['delete'](1);
    expect(mockInvitesApiService.delete).toHaveBeenCalledWith(1);
  });

  it('should write url to clipboard and notify when copyLink is called', async () => {
    await setupTestBed([sampleInvite]);
    if (!navigator.clipboard) {
      Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
    }
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const viewItems = component['invites']();

    await component['copyLink'](viewItems[0]);

    expect(writeTextSpy).toHaveBeenCalledWith(sampleInvite.url);
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'SETTINGS.INVITES.COPIED_SUCCESS',
      expect.objectContaining({ appearance: 'positive' }),
    );
  });

  it.each(['used', 'revoked', 'expired'] as const)(
    'should not write a link to the clipboard when status is %s',
    async (status) => {
      await setupTestBed([{ ...sampleInvite, status }]);
      if (!navigator.clipboard) {
        Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
      }
      const writeTextSpy = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue(undefined);

      await component['copyLink'](component['invites']()[0]);

      expect(writeTextSpy).not.toHaveBeenCalled();
      expect(mockNotificationService.open).not.toHaveBeenCalled();
    },
  );

  it('should call resend on invitesApiService and notify on success', async () => {
    mockInvitesApiService.resend.mockReturnValue(of(sampleInvite));
    await setupTestBed([sampleInvite]);

    component['resendEmail'](1);

    expect(mockInvitesApiService.resend).toHaveBeenCalledWith(1);
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'SETTINGS.INVITES.RESEND_SUCCESS',
      expect.objectContaining({ appearance: 'positive' }),
    );
  });

  it('should compute canResendEmail and isResendCooldown based on emailSentAt and SMTP', async () => {
    const recentSentDate = new Date(Date.now() - 2 * 60 * 1000); // 2 mins ago
    const oldSentDate = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago

    const cooldownInvite: IInvite = {
      ...sampleInvite,
      id: 1,
      emailSent: true,
      emailSentAt: recentSentDate,
    };
    const readyInvite: IInvite = {
      ...sampleInvite,
      id: 2,
      emailSent: true,
      emailSentAt: oldSentDate,
    };

    await setupTestBed([cooldownInvite, readyInvite]);
    const items = component['invites']();

    expect(items[0].canResendEmail).toBe(true);
    expect(items[0].isResendCooldown).toBe(true);

    expect(items[1].canResendEmail).toBe(true);
    expect(items[1].isResendCooldown).toBe(false);
  });

  it('should render email text with tuiFade and positive badge when email was sent', async () => {
    const sentInvite: IInvite = { ...sampleInvite, id: 1, emailSent: true };
    const unsentInvite: IInvite = {
      ...sampleInvite,
      id: 2,
      email: 'unsent@example.com',
      emailSent: false,
    };

    await setupTestBed([sentInvite, unsentInvite]);
    const compiled = fixture.nativeElement as HTMLElement;
    const emailRows = compiled.querySelectorAll('tbody tr .col-email');

    expect(emailRows.length).toBe(2);

    // First row: sent invite has email-text and positive badge
    const firstRowText = emailRows[0].querySelector('.email-text');
    expect(firstRowText).not.toBeNull();
    expect(firstRowText?.textContent).toContain(sampleInvite.email);
    const firstRowBadge = emailRows[0].querySelector('[tuiBadge]');
    expect(firstRowBadge).not.toBeNull();
    expect(firstRowBadge?.getAttribute('appearance')).toBe('positive');
    expect(firstRowBadge?.textContent).toContain('SETTINGS.INVITES.EMAIL_SENT');

    // Second row: unsent invite has email-text but NO badge
    const secondRowText = emailRows[1].querySelector('.email-text');
    expect(secondRowText).not.toBeNull();
    expect(secondRowText?.textContent).toContain('unsent@example.com');
    const secondRowBadge = emailRows[1].querySelector('[tuiBadge]');
    expect(secondRowBadge).toBeNull();
  });
});
