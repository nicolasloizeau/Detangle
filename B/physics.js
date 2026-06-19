// ── Setup: circle initialization ─────────────────────────────────────────────
function initCircle() {
  points = [];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = Math.min(canvas.width, canvas.height) * CIRCLE_RADIUS;
  for (let i = 0; i < N_POINTS; i++) {
    const a = (2 * Math.PI * i) / N_POINTS;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    points.push({ x, y, px: x, py: y });
  }
  restLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  bendRest = points.map((p, i) => {
    const q = points[(i + 2) % N_POINTS];
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  gridCellSize = 4 * restLen;
  crossings = [];
}

// ── Verlet integration ───────────────────────────────────────────────────────
function integrate() {
  for (const p of points) {
    const vx = (p.x - p.px) * DAMPING;
    const vy = (p.y - p.py) * DAMPING;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy;
  }
}

// Restore target distance between a and b; pinned (dragged) endpoints don't move
function applyDist(a, b, target, stiffness, aPinned, bPinned) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1e-9;
  const corr = ((dist - target) / dist) * stiffness;
  if (!aPinned && !bPinned) {
    a.x += dx * corr * 0.5;
    a.y += dy * corr * 0.5;
    b.x -= dx * corr * 0.5;
    b.y -= dy * corr * 0.5;
  } else if (!aPinned) {
    a.x += dx * corr;
    a.y += dy * corr;
  } else if (!bPinned) {
    b.x -= dx * corr;
    b.y -= dy * corr;
  }
}

function solveConstraints() {
  const n = points.length;
  for (let iter = 0; iter < CONSTRAINT_ITER; iter++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      applyDist(points[i], points[j], restLen, 1, i === dragged, j === dragged);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 2) % n;
      applyDist(points[i], points[j], bendRest[i], BEND_STIFFNESS, i === dragged, j === dragged);
    }
    if (dragged !== null) {
      points[dragged].x = mouseX;
      points[dragged].y = mouseY;
    }
  }
}

function update() {
  for (let s = 0; s < SUBSTEPS; s++) {
    integrate();
    solveConstraints();
  }
  crossings = updateCrossings(points, crossings);
}

// ════════════════════════════════════════════════════════════════════════════
// CROSSINGS — spatial grid, intersection detection, persistence
// ════════════════════════════════════════════════════════════════════════════

// Wrap-around distance between two positions in [0, N_POINTS)
function toroidalDist(a, b) {
  const d = Math.abs(a - b) % N_POINTS;
  return Math.min(d, N_POINTS - d);
}

// Map each segment to every grid cell its bounding box overlaps
function buildGrid(pts, cellSize) {
  const grid = new Map();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n];
    const cx0 = Math.floor(Math.min(a.x, b.x) / cellSize);
    const cy0 = Math.floor(Math.min(a.y, b.y) / cellSize);
    const cx1 = Math.floor(Math.max(a.x, b.x) / cellSize);
    const cy1 = Math.floor(Math.max(a.y, b.y) / cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = `${cx},${cy}`;
        let cell = grid.get(key);
        if (!cell) grid.set(key, (cell = []));
        cell.push(i);
      }
    }
  }
  return grid;
}

// Unique unordered [lo, hi] segment pairs sharing at least one grid cell
function candidatePairs(grid, n) {
  const seen = new Set();
  const pairs = [];
  for (const segs of grid.values()) {
    for (let a = 0; a < segs.length; a++) {
      for (let b = a + 1; b < segs.length; b++) {
        const lo = Math.min(segs[a], segs[b]);
        const hi = Math.max(segs[a], segs[b]);
        const key = lo * n + hi;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([lo, hi]);
        }
      }
    }
  }
  return pairs;
}

// Parametric segment-segment intersection; null if none, parallel, or adjacent
function segmentIntersect(pts, i, j) {
  const n = pts.length;
  if (j === (i + 1) % n || i === (j + 1) % n) return null; // share a node
  const ax = pts[i].x,
    ay = pts[i].y;
  const bx = pts[(i + 1) % n].x,
    by = pts[(i + 1) % n].y;
  const cx = pts[j].x,
    cy = pts[j].y;
  const dx = pts[(j + 1) % n].x,
    dy = pts[(j + 1) % n].y;
  const rx = bx - ax,
    ry = by - ay;
  const sx = dx - cx,
    sy = dy - cy;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-10) return null;
  const ex = cx - ax,
    ey = cy - ay;
  const t = (ex * sy - ey * sx) / denom;
  const u = (ex * ry - ey * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: { x: ax + t * rx, y: ay + t * ry }, ti: t, tj: u };
}

// All raw crossings this frame via grid → candidate pairs → intersect
function detectRawCrossings(pts) {
  const grid = buildGrid(pts, gridCellSize);
  const raw = [];
  for (const [i, j] of candidatePairs(grid, pts.length)) {
    const hit = segmentIntersect(pts, i, j);
    if (hit) raw.push({ pA: i + hit.ti, pB: j + hit.tj, point: hit.point });
  }
  return raw;
}

// Average speed of the two nodes bounding the segment at loop position pos
function strandSpeed(pts, pos) {
  const seg = Math.floor(pos) % pts.length;
  const nxt = (seg + 1) % pts.length;
  const sA = Math.hypot(pts[seg].x - pts[seg].px, pts[seg].y - pts[seg].py);
  const sB = Math.hypot(pts[nxt].x - pts[nxt].px, pts[nxt].y - pts[nxt].py);
  return (sA + sB) * 0.5;
}

// Assign over/under for a newly created crossing based on speed and drag button
function assignNewCrossing(raw, pts) {
  const sA = strandSpeed(pts, raw.pA);
  const sB = strandSpeed(pts, raw.pB);
  // left-drag: faster goes UNDER; right-drag or no drag: faster goes OVER
  const fasterIsOver = dragButton !== 0;
  const overPos = (sA >= sB) === fasterIsOver ? raw.pA : raw.pB;
  const underPos = overPos === raw.pA ? raw.pB : raw.pA;
  return { overPos, underPos, point: raw.point };
}

// Match raw crossings to the previous frame's and propagate over/under
function updateCrossings(pts, prev) {
  const raw = detectRawCrossings(pts);

  // sorted (lo, hi) pairs used for position-space matching
  const rawS = raw.map((r) => ({ lo: Math.min(r.pA, r.pB), hi: Math.max(r.pA, r.pB), r }));
  const prevS = prev.map((p) => ({
    lo: Math.min(p.overPos, p.underPos),
    hi: Math.max(p.overPos, p.underPos),
    p,
    used: false,
  }));

  // all (ri, pi) candidates within MATCH_RADIUS, sorted by distance for greedy match
  const cands = [];
  for (let ri = 0; ri < rawS.length; ri++) {
    for (let pi = 0; pi < prevS.length; pi++) {
      const d = toroidalDist(rawS[ri].lo, prevS[pi].lo) + toroidalDist(rawS[ri].hi, prevS[pi].hi);
      if (d < MATCH_RADIUS) cands.push({ ri, pi, d });
    }
  }
  cands.sort((a, b) => a.d - b.d);

  const result = new Array(raw.length).fill(null);
  for (const { ri, pi } of cands) {
    if (result[ri] || prevS[pi].used) continue;
    prevS[pi].used = true;
    // propagation: whichever raw pos is closer to prev overPos stays over
    const r = rawS[ri].r;
    const prevOver = prevS[pi].p.overPos;
    const overPos =
      toroidalDist(r.pA, prevOver) <= toroidalDist(r.pB, prevOver) ? r.pA : r.pB;
    const underPos = overPos === r.pA ? r.pB : r.pA;
    result[ri] = { overPos, underPos, point: r.point };
  }

  // unmatched raw crossings are newly created — assign from scratch
  for (let ri = 0; ri < raw.length; ri++) {
    if (!result[ri]) result[ri] = assignNewCrossing(raw[ri], pts);
  }
  return result;
}
