/** @vitest-environment jsdom */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { EUserRole, IUser } from '@konvoez/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WithUserDialogDirective } from './with-user-dialog.directive';

@Component({
  imports: [WithUserDialogDirective],
  template: '<div [appWithUserDialog]="user">Open user</div>',
})
class HostComponent {
  readonly user: IUser = {
    id: 42,
    username: 'alice',
    fullname: 'Alice Example',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };
}

describe('WithUserDialogDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let open: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    open = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: UserDialogService, useValue: { open } }],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens the user dialog when the host is clicked', () => {
    const host = fixture.nativeElement.querySelector('div') as HTMLElement;

    host.click();

    expect(open).toHaveBeenCalledExactlyOnceWith(
      fixture.componentInstance.user,
    );
  });
});
