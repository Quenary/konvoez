const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'overlay']);

/** Share of the viewport the finger must travel before the page reloads. */
const PULL_DISTANCE_RATIO = 0.1;

export function pullDistancePx(viewportHeight: number): number {
  return Math.max(1, Math.round(viewportHeight * PULL_DISTANCE_RATIO));
}

/** Finger travel in px before the direction of a gesture is decided. */
const GESTURE_SLOP_PX = 6;

export type GestureDirection = 'undecided' | 'down' | 'other';

/** A gesture is a pull only when it moves down and mostly vertically. */
export function gestureDirection(dx: number, dy: number): GestureDirection {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < GESTURE_SLOP_PX) {
    return 'undecided';
  }
  return dy > 0 && dy > Math.abs(dx) ? 'down' : 'other';
}

/**
 * A downward pull reloads the page only when every nested vertical scroller
 * between the touch and the shell is already at its visual top.
 * The chat list is flipped (`scaleY(-1)`), so that top is the far end of the
 * scroll, and `scrollTop === 0` is the resting position at the newest message.
 */
export function nestedScrollBlocksPull(
  target: Node,
  boundary: HTMLElement,
): boolean {
  let node = target instanceof Element ? target : target.parentElement;
  while (node && node !== boundary) {
    if (node instanceof HTMLElement && verticalScrollNotAtStart(node)) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function verticalScrollNotAtStart(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (!SCROLLABLE_OVERFLOW.has(style.overflowY) || maxScroll <= 0) {
    return false;
  }
  if (isFlippedVertically(style.transform)) {
    return maxScroll - element.scrollTop > 1;
  }
  return element.scrollTop > 0;
}

function isFlippedVertically(transform: string): boolean {
  const matrix = /^matrix(?:3d)?\(([^)]+)\)$/.exec(transform);
  if (!matrix) {
    return false;
  }
  const values = matrix[1].split(',').map((part) => Number(part.trim()));
  const scaleY = transform.startsWith('matrix3d') ? values[5] : values[3];
  return scaleY < 0;
}
