import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TUI_SCROLL_REF } from '@taiga-ui/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { PullToRefreshDirective } from './pull-to-refresh.directive';

@Component({
  selector: 'app-pull-test-host',
  imports: [PullToRefreshDirective],
  template: `
    <div
      appPullToRefresh
      class="shell">
      <div class="list"><span class="item">item</span></div>
    </div>
  `,
})
class TestHostComponent {}

function touchEvent(
  type: string,
  target: EventTarget,
  points: readonly [number, number][],
): TouchEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as unknown as TouchEvent;
  const touches = points.map(([clientX, clientY]) => ({ clientX, clientY }));
  Object.defineProperties(event, {
    touches: { value: touches },
    target: { value: target },
  });
  return event;
}

function query(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) {
    throw new Error(`${selector} not found`);
  }
  return found;
}

describe('PullToRefreshDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let shell: HTMLElement;
  let item: HTMLElement;
  let list: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    shell = query(root, '.shell');
    list = query(root, '.list');
    item = query(root, '.item');
  });

  function gesture(
    start: [number, number],
    moves: readonly (readonly [number, number][])[],
  ): boolean[] {
    shell.dispatchEvent(touchEvent('touchstart', item, [start]));
    const prevented = moves.map((points) => {
      const move = touchEvent('touchmove', item, points);
      shell.dispatchEvent(move);
      return move.defaultPrevented;
    });
    shell.dispatchEvent(touchEvent('touchend', item, []));
    return prevented;
  }

  it('cancels a single-finger pull down', () => {
    expect(
      gesture([100, 100], [[[100, 110]], [[100, 140]], [[100, 200]]]),
    ).toEqual([true, true, true]);
  });

  it.each([
    ['scroll up', [[[100, 90]], [[100, 60]]] as [number, number][][]],
    ['horizontal swipe', [[[130, 102]], [[160, 104]]] as [number, number][][]],
    [
      'pinch',
      [
        [
          [100, 110],
          [140, 110],
        ],
      ] as [number, number][][],
    ],
  ])('leaves %s to the browser', (_name, moves) => {
    expect(gesture([100, 100], moves).every((prevented) => !prevented)).toBe(
      true,
    );
  });

  it('does not cancel a later pull-like move after the gesture was rejected', () => {
    expect(
      gesture([100, 100], [[[100, 80]], [[100, 120]], [[100, 160]]]),
    ).toEqual([false, false, false]);
  });

  it('keeps the browser scroll when the touch starts in a scrolled nested list', () => {
    Object.defineProperties(list, {
      scrollHeight: { value: 400 },
      clientHeight: { value: 100 },
      scrollTop: { value: 50 },
    });
    list.style.overflowY = 'auto';

    expect(gesture([100, 100], [[[100, 140]]])).toEqual([false]);
    expect(
      fixture.debugElement.children[0].injector.get(TUI_SCROLL_REF)
        .nativeElement.scrollTop,
    ).toBe(1);
  });

  it('does not touch the document or leak listeners after destroy', () => {
    const probe =
      fixture.debugElement.children[0].injector.get(
        TUI_SCROLL_REF,
      ).nativeElement;
    expect(probe.isConnected).toBe(false);

    fixture.destroy();
    shell.dispatchEvent(touchEvent('touchstart', item, [[100, 100]]));
    const move = touchEvent('touchmove', item, [[100, 200]]);
    shell.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
  });
});
