// ── Config ───────────────────────────────────────────────────────────────────
const N_POINTS = 1024;
const CIRCLE_RADIUS = 0.45; // fraction of the smaller canvas dimension
const CONSTRAINT_ITER = 30;
const DAMPING = 0.8; // lower = more friction
const BEND_STIFFNESS = 0.1; // 0..1, resists sharp kinks
const SUBSTEPS = 2;
const GRAB_RADIUS = 30; // pixels

const LINE_WIDTH = 8;
const COLOR_BG = "#292929";
const COLOR_ROPE = "#C9C9C9";

const MATCH_RADIUS = 1.5; // position units (toroidal), for crossing persistence
const RENDER_CROSSING_LENGTH = 40; // pixels; fade window around each crossing (pass 1)
const RENDER_CROSSING_LENGTH_2 = 12; // pixels; over-strand redraw width (pass 2)
const CROSSING_DARK_FACTOR = 0.5; // brightness multiplier at the under-strand center (< 1)
const CROSSING_LIGHT_FACTOR = 1.5; // brightness multiplier at the over-strand center  (> 1)

// ── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// ── Shared state ─────────────────────────────────────────────────────────────
let points = []; // [{ x, y, px, py }, ...]
let restLen = 0; // segment rest length (same for all segments)
let bendRest = []; // rest distances for bending pairs (i → i+2)
let crossings = []; // [{ overPos, underPos, point }]
let gridCellSize = 24; // ~4 * restLen; updated in initCircle
let dragged = null; // index of grabbed point, or null
let dragButton = null; // 0=left, 2=right, null=none
let mouseX = 0,
  mouseY = 0;

// ── Input: mouse drag ────────────────────────────────────────────────────────
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

// ── Resize ───────────────────────────────────────────────────────────────────
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initCircle();
}
window.addEventListener("resize", resize);

// ── Main loop ────────────────────────────────────────────────────────────────
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

// Deferred so physics.js / rendering.js are loaded before the first frame
window.addEventListener("DOMContentLoaded", () => {
  resize();
  requestAnimationFrame(loop);
});
