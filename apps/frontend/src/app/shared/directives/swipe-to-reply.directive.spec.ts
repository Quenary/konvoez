import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeToReplyDirective } from './swipe-to-reply.directive';

@Component({
  selector: 'app-swipe-test-host',
  imports: [SwipeToReplyDirective],
  template: `
    <div
      class="message"
      [appSwipeToReplyDisabled]="disabled()"
      [appSwipeToReplyThreshold]="threshold()"
      [appSwipeToReplyMax]="max()"
      (appSwipeToReply)="onReply()"
      appSwipeToReply>
      <div class="message-row">Message content</div>
      <div class="message-swipe-indicator"></div>
      <audio controls></audio>
    </div>
  `,
})
class TestHostComponent {
  readonly disabled = signal(false);
  readonly threshold = signal(50);
  readonly max = signal(72);
  replyCalls = 0;

  onReply(): void {
    this.replyCalls++;
  }
}

function createTouch(
  identifier: number,
  target: EventTarget,
  clientX: number,
  clientY: number,
): Touch {
  return {
    identifier,
    target,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY,
    screenX: clientX,
    screenY: clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 0,
  } as unknown as Touch;
}

function createTouchEvent(
  type: string,
  touches: Touch[],
  changedTouches: Touch[] = touches,
): TouchEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as unknown as TouchEvent;

  const toTouchList = (list: Touch[]) => ({
    ...list,
    length: list.length,
    item: (i: number) => list[i] ?? null,
  });

  Object.defineProperty(event, 'touches', {
    value: toTouchList(touches),
  });

  Object.defineProperty(event, 'changedTouches', {
    value: toTouchList(changedTouches),
  });

  return event;
}

describe('SwipeToReplyDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let hostEl: HTMLElement;
  let rowEl: HTMLElement;
  let indicatorEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    hostEl = fixture.nativeElement.querySelector('.message');
    rowEl = fixture.nativeElement.querySelector('.message-row');
    indicatorEl = fixture.nativeElement.querySelector(
      '.message-swipe-indicator',
    );
  });

  it('emits appSwipeToReply when swiping left past threshold', () => {
    const t0 = createTouch(1, hostEl, 200, 100);
    hostEl.dispatchEvent(createTouchEvent('touchstart', [t0]));

    const t1 = createTouch(1, hostEl, 130, 100);
    window.dispatchEvent(createTouchEvent('touchmove', [t1]));

    expect(rowEl.style.transform).toContain('translateX(-');
    expect(indicatorEl.classList.contains('is-right')).toBe(true);
    expect(indicatorEl.classList.contains('is-active')).toBe(true);

    const tEnd = createTouch(1, hostEl, 130, 100);
    window.dispatchEvent(createTouchEvent('touchend', [], [tEnd]));

    expect(fixture.componentInstance.replyCalls).toBe(1);
    expect(rowEl.classList.contains('is-releasing')).toBe(true);
  });

  it('emits appSwipeToReply when swiping right past threshold', () => {
    const t0 = createTouch(1, hostEl, 100, 100);
    hostEl.dispatchEvent(createTouchEvent('touchstart', [t0]));

    const t1 = createTouch(1, hostEl, 170, 100);
    window.dispatchEvent(createTouchEvent('touchmove', [t1]));

    expect(rowEl.style.transform).toContain('translateX(');
    expect(indicatorEl.classList.contains('is-left')).toBe(true);
    expect(indicatorEl.classList.contains('is-active')).toBe(true);

    const tEnd = createTouch(1, hostEl, 170, 100);
    window.dispatchEvent(createTouchEvent('touchend', [], [tEnd]));

    expect(fixture.componentInstance.replyCalls).toBe(1);
  });

  it.each([
    { toX: 130, cancelsTouchEnd: true, emits: true },
    { toX: 180, cancelsTouchEnd: false, emits: false },
  ])(
    'cancels only a past-threshold touchend (toX=$toX)',
    ({ toX, cancelsTouchEnd, emits }) => {
      const t0 = createTouch(1, hostEl, 200, 100);
      hostEl.dispatchEvent(createTouchEvent('touchstart', [t0]));

      const move = createTouchEvent('touchmove', [
        createTouch(1, hostEl, toX, 100),
      ]);
      const preventMove = vi.spyOn(move, 'preventDefault');
      window.dispatchEvent(move);
      expect(preventMove).not.toHaveBeenCalled();

      const end = createTouchEvent(
        'touchend',
        [],
        [createTouch(1, hostEl, toX, 100)],
      );
      const preventEnd = vi.spyOn(end, 'preventDefault');
      window.dispatchEvent(end);

      expect(preventEnd).toHaveBeenCalledTimes(cancelsTouchEnd ? 1 : 0);
      expect(fixture.componentInstance.replyCalls).toBe(emits ? 1 : 0);
    },
  );

  it('does not emit appSwipeToReply when swipe distance is below threshold', () => {
    const t0 = createTouch(1, hostEl, 200, 100);
    hostEl.dispatchEvent(createTouchEvent('touchstart', [t0]));

    const t1 = createTouch(1, hostEl, 180, 100);
    window.dispatchEvent(createTouchEvent('touchmove', [t1]));

    expect(indicatorEl.classList.contains('is-active')).toBe(false);

    const tEnd = createTouch(1, hostEl, 180, 100);
    window.dispatchEvent(createTouchEvent('touchend', [], [tEnd]));

    expect(fixture.componentInstance.replyCalls).toBe(0);
  });

  it('cancels horizontal swipe when vertical gesture is detected first', () => {
    const t0 = createTouch(1, hostEl, 200, 100);
    hostEl.dispatchEvent(createTouchEvent('touchstart', [t0]));

    // Vertical movement > 6px with |dy| > |dx|
    const t1 = createTouch(1, hostEl, 201, 120);
    window.dispatchEvent(createTouchEvent('touchmove', [t1]));

    // Subsequent horizontal movement should be ignored
    const t2 = createTouch(1, hostEl, 100, 120);
    window.dispatchEvent(createTouchEvent('touchmove', [t2]));

    const tEnd = createTouch(1, hostEl, 100, 120);
    window.dispatchEvent(createTouchEvent('touchend', [], [tEnd]));

    expect(fixture.componentInstance.replyCalls).toBe(0);
    expect(rowEl.style.transform).toBe('');
  });

  it('ignores touches when appSwipeToReplyDisabled is true', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    const t0 = createTouch(1, hostEl, 200, 100);
    hostEl.dispatchEvent(createTouchEvent('touchstart', [t0]));

    const t1 = createTouch(1, hostEl, 100, 100);
    window.dispatchEvent(createTouchEvent('touchmove', [t1]));

    expect(rowEl.style.transform).toBe('');

    const tEnd = createTouch(1, hostEl, 100, 100);
    window.dispatchEvent(createTouchEvent('touchend', [], [tEnd]));

    expect(fixture.componentInstance.replyCalls).toBe(0);
  });

  it('does not start a swipe from an audio control', () => {
    const audio = hostEl.querySelector('audio');
    expect(audio).toBeInstanceOf(HTMLAudioElement);
    if (!(audio instanceof HTMLAudioElement)) {
      return;
    }

    const t0 = createTouch(1, audio, 200, 100);
    audio.dispatchEvent(createTouchEvent('touchstart', [t0]));

    const t1 = createTouch(1, audio, 100, 100);
    window.dispatchEvent(createTouchEvent('touchmove', [t1]));

    expect(rowEl.style.transform).toBe('');

    const tEnd = createTouch(1, audio, 100, 100);
    window.dispatchEvent(createTouchEvent('touchend', [], [tEnd]));

    expect(fixture.componentInstance.replyCalls).toBe(0);
  });

  it('resets state on touchcancel without emitting', () => {
    const t0 = createTouch(1, hostEl, 200, 100);
    hostEl.dispatchEvent(createTouchEvent('touchstart', [t0]));

    const t1 = createTouch(1, hostEl, 100, 100);
    window.dispatchEvent(createTouchEvent('touchmove', [t1]));

    window.dispatchEvent(createTouchEvent('touchcancel', []));

    expect(fixture.componentInstance.replyCalls).toBe(0);
    expect(rowEl.classList.contains('is-releasing')).toBe(true);
  });
});
