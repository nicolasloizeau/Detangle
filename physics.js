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
    points.push({ x, y, z: 0, px: x, py: y, pz: 0 });
  }
  restLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y, 0);
  bendRest = points.map((p, i) => {
    const q = points[(i + 2) % N_POINTS];
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
  });
  gridCellSize = 4 * restLen;
  crossings = [];
}

// ── Verlet integration (x, y, z) ─────────────────────────────────────────────
function integrate() {
  for (const p of points) {
    const vx = (p.x - p.px) * DAMPING;
    const vy = (p.y - p.py) * DAMPING;
    const vz = (p.z - p.pz) * Z_DAMPING;
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    p.x += vx;
    p.y += vy;
    p.z += vz;
  }
}

// ── 3D constraints (inextensible + bending) ──────────────────────────────────
// Restore target 3D distance between a and b; pinned (dragged) endpoints don't move
function applyDist(a, b, target, stiffness, aPinned, bPinned) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz) || 1e-9;
  const corr = ((dist - target) / dist) * stiffness;
  if (!aPinned && !bPinned) {
    a.x += dx * corr * 0.5;  a.y += dy * corr * 0.5;  a.z += dz * corr * 0.5;
    b.x -= dx * corr * 0.5;  b.y -= dy * corr * 0.5;  b.z -= dz * corr * 0.5;
  } else if (!aPinned) {
    a.x += dx * corr;  a.y += dy * corr;  a.z += dz * corr;
  } else if (!bPinned) {
    b.x -= dx * corr;  b.y -= dy * corr;  b.z -= dz * corr;
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

// ── Z dynamics (act on z only) ───────────────────────────────────────────────
// Ground pull toward the plane, then Laplacian smoothing for out-of-plane stiffness.
function applyZDynamics() {
  const n = points.length;
  for (const p of points) p.z -= Z_GROUND * p.z;
  const z = points.map((p) => p.z);
  for (let i = 0; i < n; i++) {
    const avg = (z[(i - 1 + n) % n] + z[(i + 1) % n]) * 0.5;
    points[i].z += Z_STIFFNESS * (avg - z[i]);
  }
}

// ── Mouse lift force (the only way the player affects z) ──────────────────────
// LEFT button lifts the grabbed stretch up, RIGHT pushes it down; flip the mapping
// with LEFT_LIFTS_UP. It's a z-acceleration (added to position, Verlet-style), not a
// z position set — opposed by the ground pull, so height builds and decays gradually.
function liftDirection() {
  if (dragButton === 0) return LEFT_LIFTS_UP ? 1 : -1; // left
  if (dragButton === 2) return LEFT_LIFTS_UP ? -1 : 1; // right
  return 0; // middle / none
}

function applyLift() {
  if (dragged === null) return;
  const dir = liftDirection();
  if (dir === 0) return;
  const n = points.length;
  for (let k = -LIFT_SPAN; k <= LIFT_SPAN; k++) {
    const i = (((dragged + k) % n) + n) % n;
    const taper = 1 - Math.abs(k) / (LIFT_SPAN + 1); // 1 at grab → ~0 at span edge
    points[i].z += dir * BUTTON_LIFT * taper;
  }
}

// ── Step ─────────────────────────────────────────────────────────────────────
function update() {
  for (let s = 0; s < SUBSTEPS; s++) {
    integrate();
    applyLift();
    solveConstraints();
    applySelfCollision(points);
    applyZDynamics();
  }
  crossings = detectCrossings(points);
  updateDiagnostics(points);
}

// ════════════════════════════════════════════════════════════════════════════
// CROSSINGS — read-only tracking; over/under is read live from z, never stored.
// Strands are allowed to overlap freely; this only records where they cross.
// ════════════════════════════════════════════════════════════════════════════

// Map each segment to every grid cell its xy bounding box overlaps
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

// Parametric xy segment-segment intersection; null if none, parallel, or adjacent
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

// All crossings this frame via grid → candidate pairs → intersect
function detectCrossings(pts) {
  const grid = buildGrid(pts, gridCellSize);
  const out = [];
  for (const [i, j] of candidatePairs(grid, pts.length)) {
    const hit = segmentIntersect(pts, i, j);
    if (hit) out.push({ pA: i + hit.ti, pB: j + hit.tj, point: hit.point });
  }
  return out;
}

// Interpolated z along the rope at loop position pos (used by rendering for over/under)
function strandZ(pts, pos) {
  const seg = Math.floor(pos) % pts.length;
  const nxt = (seg + 1) % pts.length;
  const f = pos - Math.floor(pos);
  return pts[seg].z * (1 - f) + pts[nxt].z * f;
}
