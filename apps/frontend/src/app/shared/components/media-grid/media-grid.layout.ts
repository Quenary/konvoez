export interface IMediaGridCell {
  readonly colSpan: number;
  readonly rowSpan: number;
}

export interface IMediaGridLayout {
  readonly columns: 6;
  readonly cells: readonly IMediaGridCell[];
  readonly singleAspect: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ratio(
  aspect: { width: number; height: number } | null | undefined,
  fallback: number,
): number {
  if (!aspect || aspect.height <= 0 || aspect.width <= 0) {
    return fallback;
  }
  return aspect.width / aspect.height;
}

export function computeMediaGridLayout(
  count: number,
  aspect?: { width: number; height: number } | null,
): IMediaGridLayout {
  if (count <= 1) {
    return {
      columns: 6,
      cells: [{ colSpan: 6, rowSpan: 1 }],
      singleAspect: clamp(ratio(aspect, 4 / 3), 0.5, 2),
    };
  }
  if (count === 2) {
    const cell = { colSpan: 6, rowSpan: 1 };
    return {
      columns: 6,
      cells: [cell, cell],
      singleAspect: clamp(ratio(aspect, 16 / 9), 1, 2),
    };
  }
  const perRow = count <= 4 ? 2 : 3;
  const remainder = count % perRow;
  const cells: IMediaGridCell[] = [];
  if (remainder > 0) {
    const span = 6 / remainder;
    for (let index = 0; index < remainder; index += 1) {
      cells.push({ colSpan: span, rowSpan: 1 });
    }
  }
  const regularSpan = 6 / perRow;
  for (let index = 0; index < count - remainder; index += 1) {
    cells.push({ colSpan: regularSpan, rowSpan: 1 });
  }
  return { columns: 6, cells, singleAspect: 1 };
}

export interface IMediaFrameLimit {
  readonly width: number;
  readonly heightFactor: number;
}

// Largest grid width that does not upscale a tile past its source pixels.
// heightFactor is the grid width, in units of the cell max-height, at which
// the tallest cell still matches that cap.
export function mediaFrameLimit(
  sizes: readonly { width: number; height: number }[],
): IMediaFrameLimit | null {
  if (sizes.length === 0) {
    return null;
  }
  const layout = computeMediaGridLayout(sizes.length, sizes[0]);
  let width = Number.POSITIVE_INFINITY;
  let heightFactor = Number.POSITIVE_INFINITY;
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index];
    if (!size || size.width <= 0 || size.height <= 0) {
      return null;
    }
    const span = layout.cells[index]?.colSpan ?? 6;
    width = Math.min(width, (size.width * 6) / span);
    const aspect =
      layout.singleAspect !== null && sizes.length <= 2
        ? layout.singleAspect
        : 1;
    heightFactor = Math.min(heightFactor, (aspect * 6) / span);
  }
  if (!Number.isFinite(width) || !Number.isFinite(heightFactor)) {
    return null;
  }
  return { width, heightFactor };
}
