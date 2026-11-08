import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { TuiNotificationService } from '@taiga-ui/core';
import { ApiErrorCode, IInvite } from '@konvoez/shared';
import { InviteCreateDialogComponent } from './invite-create-dialog.component';
import { InvitesApiService } from '@core/api/invites-api.service';
import { PublicStore } from '@core/stores/public.store';

describe('InviteCreateDialogComponent', () => {
  let component: InviteCreateDialogComponent;
  let fixture: ComponentFixture<InviteCreateDialogComponent>;
  let isSmtpConfiguredSignal: ReturnType<typeof signal<boolean>>;
  let appUrlConfiguredSignal: ReturnType<typeof signal<boolean>>;

  const mockContext = {
    completeWith: vi.fn(),
  };

  const mockInvitesApiService = {
    create: vi.fn(),
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue(of(null)),
  };

  const sampleInvite: IInvite = {
    id: 1,
    code: 'code12345',
    email: 'user@example.com',
    status: 'active',
    author: { id: 10, username: 'admin', fullname: 'Admin' },
    expiresAt: new Date(Date.now() + 3600000),
    usedAt: null,
    usedBy: null,
    revokedAt: null,
    emailSent: false,
    emailSentAt: null,
    createdAt: new Date(),
    updatedAt: null,
    url: 'https://app.konvoez.test/auth/register?code=code12345&email=user%40example.com',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    isSmtpConfiguredSignal = signal(true);
    appUrlConfiguredSignal = signal(true);

    const mockPublicStore = {
      isSmtpConfigured: isSmtpConfiguredSignal,
      isAppUrlConfigured: appUrlConfiguredSignal,
    };

    await TestBed.configureTestingModule({
      imports: [InviteCreateDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockContext },
        { provide: InvitesApiService, useValue: mockInvitesApiService },
        { provide: PublicStore, useValue: mockPublicStore },
        { provide: TuiNotificationService, useValue: mockNotificationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InviteCreateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize with default values and sendEmail disabled', () => {
    expect(component['form'].getRawValue()).toEqual({
      email: '',
      sendEmail: false,
      ttlMinutes: 1440,
    });
    expect(component['form'].controls.sendEmail.disabled).toBe(true);
    expect(component['inviteUrl']()).toBe('');
  });

  it('should enable and check sendEmail automatically when valid email is entered', () => {
    component['form'].controls.email.setValue('newuser@example.com');

    expect(component['form'].controls.sendEmail.disabled).toBe(false);
    expect(component['form'].controls.sendEmail.value).toBe(true);
  });

  it('should keep sendEmail unchecked if user manually unchecks it and continues editing', () => {
    component['form'].controls.email.setValue('user@example.com');
    expect(component['form'].controls.sendEmail.value).toBe(true);

    component['form'].controls.sendEmail.setValue(false);
    component['form'].controls.email.setValue('user2@example.com');

    expect(component['form'].controls.sendEmail.value).toBe(false);
    expect(component['form'].controls.sendEmail.disabled).toBe(false);
  });

  it('should disable and uncheck sendEmail when email is cleared or invalid', () => {
    component['form'].controls.email.setValue('user@example.com');
    expect(component['form'].controls.sendEmail.value).toBe(true);

    component['form'].controls.email.setValue('');

    expect(component['form'].controls.sendEmail.value).toBe(false);
    expect(component['form'].controls.sendEmail.disabled).toBe(true);
  });

  it('should keep sendEmail disabled and false when SMTP is not configured', () => {
    isSmtpConfiguredSignal.set(false);

    component['form'].controls.email.setValue('user@example.com');

    expect(component['form'].controls.sendEmail.disabled).toBe(true);
    expect(component['form'].controls.sendEmail.value).toBe(false);
  });

  it('should use invite.url when provided by backend', () => {
    component['createdInvite'].set(sampleInvite);
    expect(component['inviteUrl']()).toBe(sampleInvite.url);
  });

  it('should build inviteUrl from window origin when invite.url is missing', () => {
    component['createdInvite'].set({ ...sampleInvite, url: undefined });
    expect(component['inviteUrl']()).toBe(
      `${window.location.origin}/auth/register?code=code12345&email=user%40example.com`,
    );
  });

  it('should keep sendEmail disabled and false when APP_URL is not configured', () => {
    appUrlConfiguredSignal.set(false);

    component['form'].controls.email.setValue('user@example.com');

    expect(component['form'].controls.sendEmail.disabled).toBe(true);
    expect(component['form'].controls.sendEmail.value).toBe(false);
  });

  it.each([
    { smtp: true, appUrl: true, visible: true },
    { smtp: false, appUrl: true, visible: false },
    { smtp: true, appUrl: false, visible: false },
  ])(
    'should render send email checkbox only when SMTP and APP_URL are configured (smtp=$smtp, appUrl=$appUrl)',
    ({ smtp, appUrl, visible }) => {
      isSmtpConfiguredSignal.set(smtp);
      appUrlConfiguredSignal.set(appUrl);
      fixture.detectChanges();

      const checkbox = (fixture.nativeElement as HTMLElement).querySelector(
        'input[formControlName="sendEmail"]',
      );
      expect(checkbox !== null).toBe(visible);
    },
  );

  it('should show a warning notification when the invite email could not be sent', () => {
    mockInvitesApiService.create.mockReturnValue(
      of({ ...sampleInvite, emailSendFailed: true }),
    );

    component['form'].controls.email.setValue('user@example.com');
    component['onSubmit']();

    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'SETTINGS.INVITES.EMAIL_SEND_WARNING',
      expect.objectContaining({ appearance: 'warning' }),
    );
    expect(component['createdInvite']()).not.toBeNull();
  });

  it('should call api.create on submit with converted ttl in ms and sendEmail flag', () => {
    mockInvitesApiService.create.mockReturnValue(of(sampleInvite));

    component['form'].controls.email.setValue('user@example.com');
    component['form'].controls.ttlMinutes.setValue(60);

    component['onSubmit']();

    expect(mockInvitesApiService.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      ttl: 60 * 60 * 1000,
      sendEmail: true,
    });
    expect(component['createdInvite']()).toEqual(sampleInvite);
    expect(component['loading']()).toBe(false);
  });

  it('should handle error when api.create fails', () => {
    mockInvitesApiService.create.mockReturnValue(
      throwError(() => new Error('Invalid TTL')),
    );

    component['form'].controls.email.setValue('');
    component['form'].controls.ttlMinutes.setValue(10);

    component['onSubmit']();

    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'GENERAL.REQ_ERR',
      expect.objectContaining({ appearance: 'negative' }),
    );
    expect(component['loading']()).toBe(false);
  });

  it('should handle INVITE_EMAIL_EXISTS error and display translated error message via notification service', () => {
    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en', {
      ERRORS: {
        INVITE_EMAIL_EXISTS:
          'An active invitation for this email already exists',
      },
    });
    translateService.use('en');

    mockInvitesApiService.create.mockReturnValue(
      throwError(() => ({
        error: { code: ApiErrorCode.INVITE_EMAIL_EXISTS },
      })),
    );

    component['form'].controls.email.setValue('duplicate@example.com');
    component['form'].controls.ttlMinutes.setValue(60);

    component['onSubmit']();

    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'An active invitation for this email already exists',
      expect.objectContaining({ appearance: 'negative' }),
    );
    expect(component['loading']()).toBe(false);
  });

  it('should not call api.create on submit when email is invalid', () => {
    component['form'].controls.email.setValue('not-an-email');
    component['form'].controls.ttlMinutes.setValue(60);

    component['onSubmit']();

    expect(mockInvitesApiService.create).not.toHaveBeenCalled();
    expect(component['form'].invalid).toBe(true);
    expect(component['form'].controls.email.touched).toBe(true);
  });

  it('should not call api.create on submit when ttlMinutes is out of range', () => {
    component['form'].controls.email.setValue('');
    component['form'].controls.ttlMinutes.setValue(0);

    component['onSubmit']();

    expect(mockInvitesApiService.create).not.toHaveBeenCalled();
    expect(component['form'].invalid).toBe(true);
    expect(component['form'].controls.ttlMinutes.touched).toBe(true);
  });

  it('should render created and sent message when invite email was sent', () => {
    component['createdInvite'].set({ ...sampleInvite, emailSent: true });
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const msg = element.querySelector('.success-message');
    expect(msg?.textContent).toContain(
      'SETTINGS.INVITES.CREATED_AND_SENT_SUCCESS',
    );
  });

  it('should render default created message when email was not sent', () => {
    component['createdInvite'].set({ ...sampleInvite, emailSent: false });
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const msg = element.querySelector('.success-message');
    expect(msg?.textContent).toContain('SETTINGS.INVITES.CREATED_SUCCESS');
  });

  it('should render invite link inside span in copy-wrapper', () => {
    component['createdInvite'].set(sampleInvite);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const span = element.querySelector('.copy-wrapper tui-copy span');
    expect(span).not.toBeNull();
    expect(span?.textContent).toContain(sampleInvite.url);
  });

  it('should complete context on close', () => {
    component['createdInvite'].set(sampleInvite);
    component['close']();
    expect(mockContext.completeWith).toHaveBeenCalledWith(sampleInvite);
  });
});
