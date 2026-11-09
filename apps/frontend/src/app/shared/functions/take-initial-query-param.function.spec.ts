import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { takeInitialQueryParam } from './take-initial-query-param.function';

describe('takeInitialQueryParam', () => {
  let queryParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.fn>;
  let activatedRoute: { queryParamMap: typeof queryParamMap$ };

  beforeEach(() => {
    queryParamMap$ = new BehaviorSubject(convertToParamMap({}));
    navigate = vi.fn().mockResolvedValue(true);
    activatedRoute = { queryParamMap: queryParamMap$ };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: activatedRoute },
      ],
    });
  });

  const read = (name: string) =>
    TestBed.runInInjectionContext(() => takeInitialQueryParam(name));

  it('returns a trimmed value and removes that param from the url', () => {
    queryParamMap$.next(
      convertToParamMap({ message: '  msg-1  ', other: 'keep' }),
    );
    const value = read('message');
    TestBed.flushEffects();

    expect(value()).toBe('msg-1');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: activatedRoute,
      queryParams: { message: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it.each(['', '   '])('keeps %j as null and does not navigate', (raw) => {
    queryParamMap$.next(convertToParamMap({ message: raw }));
    const value = read('message');
    TestBed.flushEffects();

    expect(value()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('follows a later value and clears it again', () => {
    const value = read('message');
    TestBed.flushEffects();
    expect(value()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    queryParamMap$.next(convertToParamMap({ message: 'msg-1' }));
    TestBed.flushEffects();
    expect(value()).toBe('msg-1');

    queryParamMap$.next(convertToParamMap({ message: 'msg-2' }));
    TestBed.flushEffects();
    expect(value()).toBe('msg-2');
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
