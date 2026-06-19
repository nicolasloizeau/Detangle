// ── Constants ──────────────────────────────────────────────────────────────
const N_POINTS = 512;
const CIRCLE_RADIUS = 0.45; // fraction of the smaller canvas dimension
const CONSTRAINT_ITER = 30;
const DAMPING = 0.8; // lower = more friction
const BEND_STIFFNESS = 0.1; // 0..1, resists sharp kinks
const GRAB_RADIUS = 30; // pixels
const LINE_WIDTH = 8;
const COLOR_BG = "#292929";
const COLOR_ROPE = "#C9C9C9";

// ── Canvas ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// ── State ──────────────────────────────────────────────────────────────────
let points = []; // [{ x, y, px, py }, ...]
let restLen = 0; // segment rest length (same for all segments)
let bendRest = []; // rest distances for bending pairs (i → i+2)
let dragged = null; // index of dragged point, or null
let mouseX = 0,
  mouseY = 0;

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
  // all segments identical on a regular circle
  restLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  // bending: distance from each point to the one two steps ahead
  bendRest = points.map((p, i) => {
    const q = points[(i + 2) % N_POINTS];
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
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
    // distance: every adjacent pair, including last → first (loop closure)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      applyDist(points[i], points[j], restLen, 1, i === dragged, j === dragged);
    }
    // bending: every point to the one two steps ahead
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
    // re-pin dragged point so constraints never pull it off the cursor
    if (dragged !== null) {
      points[dragged].x = mouseX;
      points[dragged].y = mouseY;
    }
  }
}

function update() {
  integrate();
  solveConstraints();
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

canvas.addEventListener("mousedown", (e) => {
  ({ x: mouseX, y: mouseY } = canvasPos(e));
  dragged = nearestPoint(mouseX, mouseY);
});
canvas.addEventListener("mousemove", (e) => {
  ({ x: mouseX, y: mouseY } = canvasPos(e));
});
canvas.addEventListener("mouseup", () => {
  dragged = null;
});

// ── Rendering ─────────────────────────────────────────────────────────────
function drawRope(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = COLOR_ROPE;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawCrossings(ctx, pts) {
  // stub — future geometry pass will detect crossing segments and overlay markers
}

function render() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRope(ctx, points);
  drawCrossings(ctx, points);
}

// ── Resize ────────────────────────────────────────────────────────────────
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initCircle(); // rebuild on resize so circle fits the new dimensions
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
