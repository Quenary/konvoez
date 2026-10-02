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
