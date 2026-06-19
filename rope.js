// ── Constants ──────────────────────────────────────────────────────────────
const N_POINTS = 1024;
const CIRCLE_RADIUS = 0.45; // fraction of the smaller canvas dimension
const CONSTRAINT_ITER = 30;
const DAMPING = 0.8; // lower = more friction
const BEND_STIFFNESS = 0.1; // 0..1, resists sharp kinks
const GRAB_RADIUS = 30; // pixels
const LINE_WIDTH = 8;
const COLOR_BG = "#292929";
const COLOR_ROPE = "#C9C9C9";
const SUBSTEPS = 2;
const MATCH_RADIUS = 1.5; // position units (toroidal), for crossing persistence
const RENDER_CROSSING_LENGTH = 40; // pixels; fade window around each crossing (passes 1)
const RENDER_CROSSING_LENGTH_2 = 20; // pixels; over-strand redraw width (pass 2)
const CROSSING_DARK_FACTOR = 0.5; // brightness multiplier at the under-strand center (< 1)
const CROSSING_LIGHT_FACTOR = 1.5; // brightness multiplier at the over-strand center  (> 1)
let GRID_CELL_SIZE = 24; // ~4 * restLen; updated after init

// ── Canvas ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// ── State ──────────────────────────────────────────────────────────────────
let points = []; // [{ x, y, px, py }, ...]
let restLen = 0; // segment rest length (same for all segments)
let bendRest = []; // rest distances for bending pairs (i → i+2)
let dragged = null;
let mouseX = 0,
  mouseY = 0;
let crossings = []; // [{overPos, underPos, point}]
let dragButton = null; // 0=left, 2=right, null=none

// ── Setup: circle initialization ───────────────────────────────────────────
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
  GRID_CELL_SIZE = 4 * restLen;
  crossings = [];
}

// ── Physics: Verlet integration ────────────────────────────────────────────
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

// Restore target distance between a and b; pinned endpoints don't move
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
      applyDist(
        points[i],
        points[j],
        bendRest[i],
        BEND_STIFFNESS,
        i === dragged,
        j === dragged,
      );
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

// ── Input: mouse drag ──────────────────────────────────────────────────────
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function nearestPoint(x, y) {
  let best = null,
    bestD = GRAB_RADIUS;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  ({ x: mouseX, y: mouseY } = canvasPos(e));
  dragged = nearestPoint(mouseX, mouseY);
  dragButton = e.button;
});
canvas.addEventListener("mousemove", (e) => {
  ({ x: mouseX, y: mouseY } = canvasPos(e));
});
canvas.addEventListener("mouseup", () => {
  dragged = null;
  dragButton = null;
});

// ── Rendering ─────────────────────────────────────────────────────────────
function drawRope(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = COLOR_ROPE;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function render() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRope(ctx, points);
  drawCrossings(ctx, points, crossings);
}

// ── Resize ────────────────────────────────────────────────────────────────
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initCircle();
}
window.addEventListener("resize", resize);

// ── Main loop ─────────────────────────────────────────────────────────────
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

resize();
requestAnimationFrame(loop);

// ════════════════════════════════════════════════════════════════════════════
// CROSSINGS — spatial grid, intersection detection, persistence, rendering
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
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    }
  }
  return grid;
}

// All unordered (i < j) segment pairs sharing at least one grid cell
function candidatePairs(grid) {
  const pairs = new Set();
  for (const segs of grid.values()) {
    for (let a = 0; a < segs.length; a++) {
      for (let b = a + 1; b < segs.length; b++) {
        const lo = Math.min(segs[a], segs[b]);
        const hi = Math.max(segs[a], segs[b]);
        pairs.add(`${lo},${hi}`);
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

// Collect all raw crossings for this frame via grid → candidate pairs → intersect
function detectRawCrossings(pts) {
  const grid = buildGrid(pts, GRID_CELL_SIZE);
  const pairs = candidatePairs(grid);
  const raw = [];
  for (const key of pairs) {
    const comma = key.indexOf(",");
    const i = +key.slice(0, comma),
      j = +key.slice(comma + 1);
    const hit = segmentIntersect(pts, i, j);
    if (hit) raw.push({ pA: i + hit.ti, pB: j + hit.tj, point: hit.point });
  }
  return raw;
}

// Average speed of the two nodes bounding segment at loop position pos
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
  const overPos = sA >= sB === fasterIsOver ? raw.pA : raw.pB;
  const underPos = overPos === raw.pA ? raw.pB : raw.pA;
  return { overPos, underPos, point: raw.point };
}

// Match raw crossings to previous frame's crossings and propagate over/under
function updateCrossings(pts, prev) {
  const raw = detectRawCrossings(pts);

  // precompute sorted (lo, hi) pairs used for position-space matching
  const rawS = raw.map((r) => ({
    lo: Math.min(r.pA, r.pB),
    hi: Math.max(r.pA, r.pB),
    r,
  }));
  const prevS = prev.map((p) => ({
    lo: Math.min(p.overPos, p.underPos),
    hi: Math.max(p.overPos, p.underPos),
    p,
    used: false,
  }));

  // all (ri, pi) candidates within MATCH_RADIUS sorted by distance for greedy match
  const cands = [];
  for (let ri = 0; ri < rawS.length; ri++) {
    for (let pi = 0; pi < prevS.length; pi++) {
      const d =
        toroidalDist(rawS[ri].lo, prevS[pi].lo) +
        toroidalDist(rawS[ri].hi, prevS[pi].hi);
      if (d < MATCH_RADIUS) cands.push({ ri, pi, d });
    }
  }
  cands.sort((a, b) => a.d - b.d);

  const matchedRi = new Set();
  const result = new Array(raw.length).fill(null);

  for (const { ri, pi } of cands) {
    if (matchedRi.has(ri) || prevS[pi].used) continue;
    matchedRi.add(ri);
    prevS[pi].used = true;
    // propagation: whichever raw pos is closer to prev overPos stays over
    const r = rawS[ri].r;
    const prevOver = prevS[pi].p.overPos;
    const overPos =
      toroidalDist(r.pA, prevOver) <= toroidalDist(r.pB, prevOver)
        ? r.pA
        : r.pB;
    const underPos = overPos === r.pA ? r.pB : r.pA;
    result[ri] = { overPos, underPos, point: r.point };
  }

  // unmatched raw crossings are newly created — assign from scratch
  for (let ri = 0; ri < raw.length; ri++) {
    if (!result[ri]) result[ri] = assignNewCrossing(raw[ri], pts);
  }
  return result;
}

// Rope color channel (gray, so a single value suffices)
const ROPE_V = parseInt(COLOR_ROPE.slice(1), 16) & 0xff;

// Redraw a polyline arc segment-by-segment with cosine-weighted brightness,
// fading from rope color at the edges to `factor` at the center.
function drawArc(ctx, pts, pos, halfSegs, factor) {
  const N = pts.length;
  const start = Math.floor(pos - halfSegs);
  const end = Math.ceil(pos + halfSegs);
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round";
  for (let k = start; k < end; k++) {
    const iA = ((k % N) + N) % N;
    const iB = (((k + 1) % N) + N) % N;
    const t = Math.cos((Math.PI * (k + 0.5 - pos)) / halfSegs) * 0.5 + 0.5; // 1 at center, 0 at edge
    const f = 1 + (factor - 1) * t;
    const v = Math.min(255, Math.max(0, ROPE_V * f)) | 0;
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.moveTo(pts[iA].x, pts[iA].y);
    ctx.lineTo(pts[iB].x, pts[iB].y);
    ctx.stroke();
  }
}

// Erase the under-strand at the crossing point by drawing a background-colored
// stroke along its direction — creates the visual gap that makes it appear to go under.
function drawGap(ctx, pts, c) {
  const N = pts.length;
  const seg = Math.floor(c.underPos) % N;
  const nxt = (seg + 1) % N;
  const dx = pts[nxt].x - pts[seg].x;
  const dy = pts[nxt].y - pts[seg].y;
  const invLen = 1 / (Math.hypot(dx, dy) || 1);
  const half = LINE_WIDTH * 0.7;
  ctx.strokeStyle = COLOR_BG;
  ctx.lineWidth = LINE_WIDTH + 4;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(c.point.x - dx * invLen * half, c.point.y - dy * invLen * half);
  ctx.lineTo(c.point.x + dx * invLen * half, c.point.y + dy * invLen * half);
  ctx.stroke();
}

// Three-pass crossing overlay drawn after drawRope.
// Pass 1: darken under-strand approach arcs.
// Gap:    erase under-strand at crossing point.
// Pass 2: draw over-strand light arcs (covers the gap).
// Pass 3: reassert over-strand center with a narrow arc.
function drawCrossings(ctx, pts, crs) {
  const halfSegs1 = RENDER_CROSSING_LENGTH / (2 * restLen);
  const halfSegs2 = RENDER_CROSSING_LENGTH_2 / (2 * restLen);
  for (const c of crs) drawArc(ctx, pts, c.underPos, halfSegs1, CROSSING_DARK_FACTOR);
  for (const c of crs) drawGap(ctx, pts, c);
  for (const c of crs) drawArc(ctx, pts, c.overPos, halfSegs1, CROSSING_LIGHT_FACTOR);
  for (const c of crs) drawArc(ctx, pts, c.overPos, halfSegs2, CROSSING_LIGHT_FACTOR);
}
