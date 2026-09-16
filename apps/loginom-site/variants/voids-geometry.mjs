// The glyphs occupy a 1000 × 700 design space. Only their strokes are voids:
// each polyline segment is swept by a disc, giving rounded capsule ends.
function bezier(points, steps = 30) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const u = 1 - t;
    return [0, 1].map(axis => u ** 3 * points[0][axis]
      + 3 * u * u * t * points[1][axis]
      + 3 * u * t * t * points[2][axis]
      + t ** 3 * points[3][axis]);
  });
}

export const VOID_SIGNS = [
  {
    id: 'table', x: 167, y: 357, radius: 6.5,
    paths: [
      [[-43, -43], [48, -43]], [[-54, -15], [48, -15]],
      [[-54, 13], [48, 13]], [[-54, 41], [32, 41]],
      [[-20, -43], [-20, 41]], [[17, -43], [17, 41]],
    ],
  },
  {
    id: 'function', x: 461, y: 351, radius: 9,
    paths: [
      bezier([[40, -67], [7, -96], [-4, -34], [-9, 3]]),
      bezier([[-9, 3], [-14, 52], [-24, 86], [-48, 61]]),
      bezier([[-42, -11], [-16, -10], [12, -12], [31, -16]]),
    ],
  },
  {
    id: 'bar-chart', x: 818, y: 166, radius: 8,
    paths: [
      [[-47, 38], [-47, 7]], [[-16, 38], [-16, -13]],
      [[15, 38], [15, -37]], [[46, 38], [46, -66]],
    ],
  },
  {
    id: 'line-chart', x: 829, y: 527, radius: 7.5,
    paths: [
      [[-59, 32], [-24, -3]], [[-24, -3], [6, 12]],
      [[6, 12], [50, -40]],
    ],
  },
].map(sign => ({
  ...sign,
  paths: sign.paths.map(path => path.map(([x, y]) => [x + sign.x, y + sign.y])),
}));

const SEGMENTS = VOID_SIGNS.flatMap(sign => sign.paths.flatMap(path =>
  path.slice(1).map((b, index) => {
    const a = path[index];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    return {
      ax: a[0], ay: a[1], bx: b[0], by: b[1], dx, dy,
      lengthSquared, length: Math.sqrt(lengthSquared), radius: sign.radius,
      minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
      minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
    };
  })));

function pointSegmentDistanceSquared(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0
    : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
}

// Intersect one capsule with a vertical line. The capsule is exactly the
// union of its endpoint discs and the rectangle between those discs.
function capsuleIntervalAtX(segment, x, radius) {
  const { ax, ay, bx, by, dx, dy, lengthSquared, length } = segment;
  let low = Infinity, high = -Infinity;
  const fromA = x - ax, fromB = x - bx;
  if (Math.abs(fromA) <= radius) {
    const reach = Math.sqrt(Math.max(0, radius * radius - fromA * fromA));
    low = ay - reach;
    high = ay + reach;
  }
  if (Math.abs(fromB) <= radius) {
    const reach = Math.sqrt(Math.max(0, radius * radius - fromB * fromB));
    low = Math.min(low, by - reach);
    high = Math.max(high, by + reach);
  }
  if (lengthSquared > 0) {
    let stripLow = -Infinity, stripHigh = Infinity;
    let rectanglePresent = true;
    // The projection onto the centre segment must be between its endpoints.
    const projection = dx * fromA;
    if (dy === 0) {
      rectanglePresent = projection >= 0 && projection <= lengthSquared;
    } else {
      const first = -projection / dy;
      const second = (lengthSquared - projection) / dy;
      stripLow = Math.min(first, second);
      stripHigh = Math.max(first, second);
    }
    // The perpendicular distance to its supporting line must be <= radius.
    const cross = dy * fromA;
    if (dx === 0) {
      rectanglePresent &&= Math.abs(cross) <= radius * length;
    } else {
      const first = (cross - radius * length) / dx;
      const second = (cross + radius * length) / dx;
      stripLow = Math.max(stripLow, Math.min(first, second));
      stripHigh = Math.min(stripHigh, Math.max(first, second));
    }
    if (rectanglePresent && stripLow <= stripHigh) {
      low = Math.min(low, ay + stripLow);
      high = Math.max(high, ay + stripHigh);
    }
  }
  return low <= high ? [low, high] : null;
}

/** Sorted, merged vertical intersections; clearance expands every capsule. */
export function voidIntervalsAtX(x, clearance = 0) {
  const intervals = [];
  const padding = Math.max(0, clearance);
  for (const segment of SEGMENTS) {
    const radius = segment.radius + padding;
    if (x < segment.minX - radius || x > segment.maxX + radius) continue;
    const interval = capsuleIntervalAtX(segment, x, radius);
    if (interval) intervals.push(interval);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], interval[1]);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** Signed capsule-union field: exact outside distance, negative inside.
 * Overlapping strokes use the minimum capsule distance inside the union. */
export function voidDistance(x, y) {
  let nearest = Infinity;
  for (const segment of SEGMENTS) {
    const boxX = Math.max(segment.minX - x, 0, x - segment.maxX);
    const boxY = Math.max(segment.minY - y, 0, y - segment.maxY);
    if (Math.hypot(boxX, boxY) - segment.radius >= nearest) continue;
    const distance = Math.sqrt(pointSegmentDistanceSquared(x, y,
      segment.ax, segment.ay, segment.bx, segment.by)) - segment.radius;
    nearest = Math.min(nearest, distance);
  }
  return nearest;
}

function segmentDistanceSquared(a, b, segment) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const offsetX = segment.ax - a[0], offsetY = segment.ay - a[1];
  const determinant = dx * segment.dy - dy * segment.dx;
  if (determinant !== 0) {
    const t = (offsetX * segment.dy - offsetY * segment.dx) / determinant;
    const u = (offsetX * dy - offsetY * dx) / determinant;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  // With no proper intersection, at least one endpoint attains the minimum.
  // This also handles parallel, collinear and zero-length segments exactly.
  return Math.min(
    pointSegmentDistanceSquared(a[0], a[1], segment.ax, segment.ay, segment.bx, segment.by),
    pointSegmentDistanceSquared(b[0], b[1], segment.ax, segment.ay, segment.bx, segment.by),
    pointSegmentDistanceSquared(segment.ax, segment.ay, a[0], a[1], b[0], b[1]),
    pointSegmentDistanceSquared(segment.bx, segment.by, a[0], a[1], b[0], b[1]),
  );
}

/** True only when the entire segment stays strictly outside the voids.
 * Tangency is rejected, including with the requested nonnegative clearance. */
export function segmentAvoidsVoids(a, b, clearance = 0) {
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
  const padding = Math.max(0, clearance);
  for (const segment of SEGMENTS) {
    const radius = segment.radius + padding;
    if (maxX < segment.minX - radius || minX > segment.maxX + radius
      || maxY < segment.minY - radius || minY > segment.maxY + radius) continue;
    if (segmentDistanceSquared(a, b, segment) <= radius * radius) return false;
  }
  return true;
}
