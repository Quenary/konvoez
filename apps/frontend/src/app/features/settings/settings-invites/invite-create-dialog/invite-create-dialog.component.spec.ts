import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { IInvite } from '@konvoez/shared';
import { InviteCreateDialogComponent } from './invite-create-dialog.component';
import { InvitesApiService } from '../invites-api.service';

describe('InviteCreateDialogComponent', () => {
  let component: InviteCreateDialogComponent;
  let fixture: ComponentFixture<InviteCreateDialogComponent>;

  const mockContext = {
    completeWith: vi.fn(),
  };

  const mockInvitesApiService = {
    create: vi.fn(),
  };

  const sampleInvite: IInvite = {
    id: 1,
    code: 'code12345',
    email: 'user@example.com',
    status: 'active',
    author: { id: 10, username: 'admin', fullname: 'Admin' },
    expiresAt: new Date(Date.now() + 3600000),
    usedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [InviteCreateDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockContext },
        { provide: InvitesApiService, useValue: mockInvitesApiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InviteCreateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize with default values', () => {
    expect(component['form'].value).toEqual({
      email: '',
      ttlMinutes: 1440,
    });
    expect(component['inviteUrl']()).toBe('');
  });

  it('should compute inviteUrl properly via URL searchParams when invite has email', () => {
    component['createdInvite'].set(sampleInvite);
    const expected = `${window.location.origin}/auth/register?code=code12345&email=user%40example.com`;
    expect(component['inviteUrl']()).toBe(expected);
  });

  it('should compute inviteUrl properly via URL searchParams when invite has no email', () => {
    component['createdInvite'].set({ ...sampleInvite, email: null });
    const expected = `${window.location.origin}/auth/register?code=code12345`;
    expect(component['inviteUrl']()).toBe(expected);
  });

  it('should call api.create on submit with converted ttl in ms', () => {
    mockInvitesApiService.create.mockReturnValue(of(sampleInvite));

    component['form'].setValue({
      email: 'user@example.com',
      ttlMinutes: 60,
    });

    component['onSubmit']();

    expect(mockInvitesApiService.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      ttl: 60 * 60 * 1000,
    });
    expect(component['createdInvite']()).toEqual(sampleInvite);
    expect(component['loading']()).toBe(false);
  });

  it('should handle error when api.create fails', () => {
    mockInvitesApiService.create.mockReturnValue(
      throwError(() => new Error('Invalid TTL')),
    );

    component['form'].setValue({
      email: '',
      ttlMinutes: 10,
    });

    component['onSubmit']();

    expect(component['error']()).toBe('Invalid TTL');
    expect(component['loading']()).toBe(false);
  });

  it('should not call api.create on submit when email is invalid', () => {
    component['form'].setValue({
      email: 'not-an-email',
      ttlMinutes: 60,
    });

    component['onSubmit']();

    expect(mockInvitesApiService.create).not.toHaveBeenCalled();
    expect(component['form'].invalid).toBe(true);
    expect(component['form'].controls.email.touched).toBe(true);
  });

  it('should not call api.create on submit when ttlMinutes is out of range', () => {
    component['form'].setValue({
      email: '',
      ttlMinutes: 0,
    });

    component['onSubmit']();

    expect(mockInvitesApiService.create).not.toHaveBeenCalled();
    expect(component['form'].invalid).toBe(true);
    expect(component['form'].controls.ttlMinutes.touched).toBe(true);
  });

  it('should complete context on close', () => {
    component['createdInvite'].set(sampleInvite);
    component['close']();
    expect(mockContext.completeWith).toHaveBeenCalledWith(sampleInvite);
  });
});
