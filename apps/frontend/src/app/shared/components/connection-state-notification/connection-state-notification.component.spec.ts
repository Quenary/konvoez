import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionStateService } from '@core/services/connection-state.service';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionStateNotificationComponent } from './connection-state-notification.component';

describe('ConnectionStateNotificationComponent', () => {
  let fixture: ComponentFixture<ConnectionStateNotificationComponent>;
  let isOnline: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    isOnline = signal(true);

    await TestBed.configureTestingModule({
      imports: [ConnectionStateNotificationComponent],
      providers: [
        provideTranslateService(),
        {
          provide: ConnectionStateService,
          useValue: {
            isOnline: isOnline.asReadonly(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectionStateNotificationComponent);
    fixture.detectChanges();
  });

  const component = () => fixture.componentInstance;

  it('keeps the notification closed while online', () => {
    expect(component()['show']()).toBe(false);
  });

  it('opens the notification when offline', () => {
    isOnline.set(false);
    expect(component()['show']()).toBe(true);
  });

  it('closes the notification when connectivity is restored', () => {
    isOnline.set(false);
    expect(component()['show']()).toBe(true);

    isOnline.set(true);
    expect(component()['show']()).toBe(false);
  });
});
