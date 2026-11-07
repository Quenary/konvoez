import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  gestureDirection,
  nestedScrollBlocksPull,
  pullDistancePx,
} from './pull-to-refresh';

interface Metrics {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
  transform?: string;
}

function element(overflowY: string, metrics: Metrics = {}): HTMLElement {
  const node = document.createElement('div');
  node.dataset['overflowY'] = overflowY;
  if (metrics.transform) {
    node.dataset['transform'] = metrics.transform;
  }
  Object.defineProperties(node, {
    scrollTop: { value: metrics.scrollTop ?? 0, writable: true },
    scrollHeight: { value: metrics.scrollHeight ?? 0 },
    clientHeight: { value: metrics.clientHeight ?? 0 },
  });
  return node;
}

function mockComputedStyle(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (node) =>
      ({
        overflowY: (node as HTMLElement).dataset['overflowY'] ?? 'visible',
        transform: (node as HTMLElement).dataset['transform'] ?? 'none',
      }) as CSSStyleDeclaration,
  );
}

describe('pullDistancePx', () => {
  it.each([
    [844, 84],
    [900, 90],
    [0, 1],
  ])('is a tenth of a %d px viewport', (height, expected) => {
    expect(pullDistancePx(height)).toBe(expected);
  });
});

describe('gestureDirection', () => {
  it.each([
    ['too short to decide', 2, 3, 'undecided'],
    ['pull down', 1, 20, 'down'],
    ['mostly vertical down', 10, 20, 'down'],
    ['scroll up', 0, -20, 'other'],
    ['horizontal swipe', 30, 8, 'other'],
    ['diagonal', 20, 20, 'other'],
  ])('%s', (_name, dx, dy, expected) => {
    expect(gestureDirection(dx, dy)).toBe(expected);
  });
});

describe('nestedScrollBlocksPull', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const scrollable = { scrollHeight: 200, clientHeight: 100 };

  it.each([
    ['scroller past its start', 'auto', 40, true],
    ['scroller at its start', 'auto', 0, false],
    ['not a scroll container', 'visible', 40, false],
  ])('%s', (_name, overflowY, scrollTop, expected) => {
    mockComputedStyle();
    const boundary = element('visible');
    const scroller = element(overflowY, { ...scrollable, scrollTop });
    const target = element('visible');
    boundary.append(scroller);
    scroller.append(target);

    expect(nestedScrollBlocksPull(target, boundary)).toBe(expected);
  });

  it('ignores a scroller with nothing to scroll', () => {
    mockComputedStyle();
    const boundary = element('visible');
    const shortScroller = element('scroll', {
      scrollTop: 40,
      scrollHeight: 100,
      clientHeight: 100,
    });
    boundary.append(shortScroller);

    expect(nestedScrollBlocksPull(shortScroller, boundary)).toBe(false);
  });

  it('resolves a text node through its parent and ignores the boundary itself', () => {
    mockComputedStyle();
    const boundary = element('auto', { ...scrollable, scrollTop: 40 });
    const scroller = element('auto', { ...scrollable, scrollTop: 40 });
    const text = document.createTextNode('x');
    boundary.append(scroller);
    scroller.append(text);

    expect(nestedScrollBlocksPull(text, boundary)).toBe(true);
    expect(nestedScrollBlocksPull(boundary, boundary)).toBe(false);
  });

  it('ignores a scroller outside the touched branch', () => {
    mockComputedStyle();
    const boundary = element('visible');
    const scroller = element('auto', { ...scrollable, scrollTop: 40 });
    const outside = element('visible');
    boundary.append(scroller, outside);

    expect(nestedScrollBlocksPull(outside, boundary)).toBe(false);
  });

  it.each([
    ['resting position', 0, true],
    ['far end', 100, false],
  ])('flipped list at its %s', (_name, scrollTop, expected) => {
    mockComputedStyle();
    const boundary = element('visible');
    const chat = element('auto', {
      ...scrollable,
      scrollTop,
      transform: 'matrix(1, 0, 0, -1, 0, 0)',
    });
    const target = element('visible');
    boundary.append(chat);
    chat.append(target);

    expect(nestedScrollBlocksPull(target, boundary)).toBe(expected);
  });
});
