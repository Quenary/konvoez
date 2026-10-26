import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DirectCallService } from '@core/services/direct-call.service';
import { IUserSafe } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingCallDialogComponent } from './pending-call-dialog.component';

const interlocutor = {
  id: 2,
  username: 'bob',
  fullname: 'Bob',
  isOwner: false,
  roles: [],
  permissions: [],
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUserSafe;

describe('PendingCallDialogComponent', () => {
  let fixture: ComponentFixture<PendingCallDialogComponent>;
  let isRinging: ReturnType<typeof signal<boolean>>;
  let interlocutorSignal: ReturnType<typeof signal<IUserSafe | null>>;
  let isInGroupRoom: ReturnType<typeof signal<boolean>>;
  let activeCall: ReturnType<typeof signal<{ isCaller: boolean } | null>>;
  let acceptCall: ReturnType<typeof vi.fn>;
  let rejectCall: ReturnType<typeof vi.fn>;
  let cancelCall: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isRinging = signal(false);
    interlocutorSignal = signal<IUserSafe | null>(null);
    isInGroupRoom = signal(false);
    activeCall = signal(null);
    acceptCall = vi.fn();
    rejectCall = vi.fn();
    cancelCall = vi.fn();

    await TestBed.configureTestingModule({
      imports: [PendingCallDialogComponent],
      providers: [
        provideTranslateService(),
        {
          provide: DirectCallService,
          useValue: {
            isRinging: isRinging.asReadonly(),
            interlocutor: interlocutorSignal.asReadonly(),
            isInGroupRoom: isInGroupRoom.asReadonly(),
            activeCall: activeCall.asReadonly(),
            acceptCall,
            rejectCall,
            cancelCall,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PendingCallDialogComponent);
    fixture.detectChanges();
  });

  const component = () => fixture.componentInstance;

  it('does not show ringing UI when idle', () => {
    expect(component()['isRinging']()).toBe(false);
  });

  it('uses incoming copy and handlers for callee', () => {
    isRinging.set(true);
    interlocutorSignal.set(interlocutor);
    activeCall.set({ isCaller: false });

    expect(component()['direction']()).toBe('incoming');
    expect(component()['pendingTitleKey']()).toBe('CALL.PENDING.INCOMING');

    component()['reject']();
    component()['accept']();

    expect(rejectCall).toHaveBeenCalled();
    expect(acceptCall).toHaveBeenCalled();
  });

  it('uses outgoing copy and cancel for caller', () => {
    isRinging.set(true);
    interlocutorSignal.set(interlocutor);
    activeCall.set({ isCaller: true });

    expect(component()['direction']()).toBe('outgoing');
    expect(component()['pendingTitleKey']()).toBe('CALL.PENDING.OUTGOING');

    component()['cancel']();
    expect(cancelCall).toHaveBeenCalled();
  });

  it('reflects group-room hint state from the service', () => {
    isInGroupRoom.set(true);
    expect(component()['isInGroupRoom']()).toBe(true);

    isInGroupRoom.set(false);
    expect(component()['isInGroupRoom']()).toBe(false);
  });
});
