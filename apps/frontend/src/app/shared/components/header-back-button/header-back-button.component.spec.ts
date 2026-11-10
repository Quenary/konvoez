import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LayoutService } from '@core/services/layout.service';
import { HeaderBackButtonComponent } from './header-back-button.component';

describe('HeaderBackButtonComponent', () => {
  let fixture: ComponentFixture<HeaderBackButtonComponent>;
  let component: HeaderBackButtonComponent;
  let router: Router;
  let location: Location;
  const isNarrowSignal = signal(true);

  beforeEach(async () => {
    isNarrowSignal.set(true);

    await TestBed.configureTestingModule({
      imports: [HeaderBackButtonComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        {
          provide: LayoutService,
          useValue: {
            isNarrow: isNarrowSignal,
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    fixture = TestBed.createComponent(HeaderBackButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('navigates to the fallback destination when this is the first in-app navigation', () => {
    vi.spyOn(location, 'getState').mockReturnValue({ navigationId: 1 });
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const backSpy = vi.spyOn(location, 'back');
    fixture.componentRef.setInput('to', '/direct');

    component['navigateBack']();

    expect(backSpy).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/direct']);
  });

  it('goes back when the in-app navigation stack is not empty', () => {
    vi.spyOn(location, 'getState').mockReturnValue({ navigationId: 2 });
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const backSpy = vi.spyOn(location, 'back');
    fixture.componentRef.setInput('to', '/direct');

    component['navigateBack']();

    expect(backSpy).toHaveBeenCalledOnce();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
