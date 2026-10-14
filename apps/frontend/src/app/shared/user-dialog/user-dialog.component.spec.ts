/** @vitest-environment jsdom */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { EUserRole, IUser } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDialogComponent } from './user-dialog.component';

describe('UserDialogComponent', () => {
  let fixture: ComponentFixture<UserDialogComponent>;
  let router: Router;
  let initiateCall: ReturnType<typeof vi.fn>;
  let completeWith: ReturnType<typeof vi.fn>;

  const user: IUser = {
    id: 42,
    username: 'alice',
    fullname: 'Alice Example',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(async () => {
    initiateCall = vi.fn().mockResolvedValue(undefined);
    completeWith = vi.fn();

    await TestBed.configureTestingModule({
      imports: [UserDialogComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        {
          provide: POLYMORPHEUS_CONTEXT,
          useValue: { data: { user }, completeWith },
        },
        { provide: DirectCallService, useValue: { initiateCall } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(UserDialogComponent);
    fixture.detectChanges();
  });

  it('shows the avatar, nickname, and full name', () => {
    const text = fixture.nativeElement.textContent as string;
    const avatar = fixture.nativeElement.querySelector(
      'app-user-avatar',
    ) as HTMLElement | null;

    expect(avatar).not.toBeNull();
    expect(text).toContain(user.username);
    expect(text).toContain(user.fullname);
  });

  it('navigates to the direct chat and closes the dialog', () => {
    const [chatButton] = fixture.nativeElement.querySelectorAll('button');

    chatButton.click();

    expect(router.navigate).toHaveBeenCalledExactlyOnceWith([
      '/direct',
      user.id,
    ]);
    expect(completeWith).toHaveBeenCalledOnce();
  });

  it('starts a direct call with the selected user', () => {
    const [, callButton] = fixture.nativeElement.querySelectorAll('button');

    callButton.click();

    expect(initiateCall).toHaveBeenCalledExactlyOnceWith(user);
  });
});
