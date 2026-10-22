import { Component, ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUI_SCROLL_REF } from '@taiga-ui/core';
import { IsVisibleDirective } from './is-visible.directive';

@Component({
  selector: 'app-is-visible-host',
  imports: [IsVisibleDirective],
  template: `<div
    [appIsVisibleThreshold]="threshold()"
    (appIsVisible)="events.push($event)"></div>`,
})
class HostComponent {
  readonly threshold = signal(0.5);
  readonly events: boolean[] = [];
}

type MockObserver = {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

describe('IsVisibleDirective', () => {
  let observers: MockObserver[];

  function entry(isIntersecting: boolean, ratio: number) {
    return {
      isIntersecting,
      intersectionRatio: ratio,
    } as IntersectionObserverEntry;
  }

  function fire(isIntersecting: boolean, ratio: number) {
    const observer = observers.at(-1);
    observer?.callback(
      [entry(isIntersecting, ratio)],
      observer as unknown as IntersectionObserver,
    );
  }

  async function create(scrollRoot: HTMLElement | null) {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: scrollRoot
        ? [{ provide: TUI_SCROLL_REF, useValue: new ElementRef(scrollRoot) }]
        : [],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    observers = [];
    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        observers.push({
          callback,
          options,
          observe: this.observe,
          disconnect: this.disconnect,
        });
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes the host with the Taiga scroll root and default threshold', async () => {
    const root = document.createElement('div');
    const fixture = await create(root);
    const host = fixture.nativeElement.querySelector('div');

    expect(observers).toHaveLength(1);
    expect(observers[0].options).toEqual({ root, threshold: 0.5 });
    expect(observers[0].observe).toHaveBeenCalledWith(host);
  });

  it('uses the Taiga default scroll ref outside a scroll container', async () => {
    await create(null);

    expect(observers[0].options?.root).toBe(document.documentElement);
  });

  it('emits only when the visibility changes', async () => {
    const fixture = await create(null);
    const events = fixture.componentInstance.events;

    fire(true, 0.6);
    fire(true, 0.9);
    fire(true, 0.3);
    fire(false, 0);
    fire(true, 1);

    expect(events).toEqual([true, false, true]);
  });

  it('does not emit visible for an intersection below the threshold', async () => {
    const fixture = await create(null);

    fire(true, 0.2);

    expect(fixture.componentInstance.events).toEqual([false]);
  });

  it('recreates the observer when the threshold changes', async () => {
    const fixture = await create(null);

    fixture.componentInstance.threshold.set(1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(observers).toHaveLength(2);
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(observers[1].options?.threshold).toBe(1);
  });

  it('disconnects on destroy', async () => {
    const fixture = await create(null);

    fixture.destroy();

    expect(observers[0].disconnect).toHaveBeenCalled();
  });
});
