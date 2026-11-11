/** @vitest-environment jsdom */
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, map } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LayoutService } from './layout.service';

describe('LayoutService', () => {
  const mobile = new BehaviorSubject(false);
  const small = new BehaviorSubject(false);

  beforeEach(() => {
    mobile.next(false);
    small.next(false);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: BreakpointObserver,
          useValue: {
            observe: (query: string) => {
              const source = query === Breakpoints.Handset ? mobile : small;
              return source.pipe(
                map((matches) => ({ matches, breakpoints: {} })),
              );
            },
          },
        },
      ],
    });
  });

  it('reports a wide screen as neither mobile nor small', () => {
    const service = TestBed.inject(LayoutService);

    expect(service.isMobile()).toBe(false);
    expect(service.isSmall()).toBe(false);
    expect(service.isNarrow()).toBe(false);
  });

  it.each([
    {
      handset: true,
      small: false,
      isMobile: true,
      isSmall: false,
      narrow: true,
    },
    {
      handset: false,
      small: true,
      isMobile: false,
      isSmall: true,
      narrow: true,
    },
    {
      handset: true,
      small: true,
      isMobile: true,
      isSmall: true,
      narrow: true,
    },
  ])(
    'maps handset $handset and small $small',
    ({ handset, small: isSmallMatch, isMobile, isSmall, narrow }) => {
      mobile.next(handset);
      small.next(isSmallMatch);
      const service = TestBed.inject(LayoutService);

      expect(service.isMobile()).toBe(isMobile);
      expect(service.isSmall()).toBe(isSmall);
      expect(service.isNarrow()).toBe(narrow);
    },
  );
});
