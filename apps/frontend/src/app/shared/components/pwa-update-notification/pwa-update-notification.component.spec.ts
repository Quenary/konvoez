import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PwaUpdateService } from '@core/services/pwa-update.service';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdateNotificationComponent } from './pwa-update-notification.component';

describe('PwaUpdateNotificationComponent', () => {
  let fixture: ComponentFixture<PwaUpdateNotificationComponent>;
  let updatePostponed: ReturnType<typeof signal<boolean>>;
  let postponedUpdateType: ReturnType<
    typeof signal<'update' | 'unrecoverable' | null>
  >;
  let applyAvailableUpdate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    updatePostponed = signal(false);
    postponedUpdateType = signal(null);
    applyAvailableUpdate = vi.fn();

    await TestBed.configureTestingModule({
      imports: [PwaUpdateNotificationComponent],
      providers: [
        provideTranslateService(),
        {
          provide: PwaUpdateService,
          useValue: {
            updatePostponed: updatePostponed.asReadonly(),
            postponedUpdateType: postponedUpdateType.asReadonly(),
            applyAvailableUpdate,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PwaUpdateNotificationComponent);
    fixture.detectChanges();
  });

  const component = () => fixture.componentInstance;

  it('keeps the notification closed when update is not postponed', () => {
    expect(component()['show']()).toBe(false);
  });

  it('opens the notification when update is postponed', () => {
    updatePostponed.set(true);
    expect(component()['show']()).toBe(true);
  });

  it('uses standard update translation keys by default or for normal update', () => {
    postponedUpdateType.set('update');
    expect(component()['labelKey']()).toBe('PWA.UPDATE.TITLE');
    expect(component()['actionKey']()).toBe('PWA.UPDATE.ACTION');
  });

  it('uses unrecoverable translation keys when postponed update is unrecoverable', () => {
    postponedUpdateType.set('unrecoverable');
    expect(component()['labelKey']()).toBe('PWA.UNRECOVERABLE.TITLE');
    expect(component()['actionKey']()).toBe('PWA.UNRECOVERABLE.ACTION');
  });

  it('triggers applyAvailableUpdate when update method is called', () => {
    component()['update']();
    expect(applyAvailableUpdate).toHaveBeenCalledTimes(1);
  });
});
