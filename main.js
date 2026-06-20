// ── Config ───────────────────────────────────────────────────────────────────
const N_POINTS = 1024;
const CIRCLE_RADIUS = 0.45; // fraction of the smaller canvas dimension
const CONSTRAINT_ITER = 30;
const DAMPING = 0.8; // lower = more friction
const BEND_STIFFNESS = 0.1; // 0..1, resists sharp kinks
const SUBSTEPS = 16; // integration steps per frame
const GRAB_RADIUS = 30; // pixels

const LINE_WIDTH = 8;
const COLOR_BG = "#292929";
const COLOR_ROPE = "#C9C9C9"; // brightness at z=0; height shades it up/down
const Z_COLOR_RANGE = 30; // z at which the rope reaches full white (+) / black (−)

const RENDER_CROSSING_LENGTH = 40; // pixels; fade window around each crossing (pass 1)
const RENDER_CROSSING_LENGTH_2 = 12; // pixels; over-strand redraw width (pass 2)
const CROSSING_DARK_FACTOR = 0.5; // brightness multiplier at the under-strand center (< 1)
const CROSSING_LIGHT_FACTOR = 1.5; // brightness multiplier at the over-strand center  (> 1)

// ── Hard sphere self-collision ────────────────────────────────────────────────
const SPHERE_RADIUS = LINE_WIDTH;      // collision sphere radius per rope point (px)
const HARD_SPHERE_IGNORE_STEPS = 12;  // skip pairs within this many rope indices
const SELF_COLLISION_PASSES = 5;      // correction passes per substep

// ── Z / quasi-3D ─────────────────────────────────────────────────────────────
const Z_GROUND = 0.01; // per-iter pull of each z toward the flat plane (z=0)
const Z_STIFFNESS = 0.2; // out-of-plane Laplacian smoothing, 0..1 (independent of xy)
const Z_DAMPING = DAMPING; // z friction in the Verlet step

// Mouse lift: held button applies a continuous z-force to the grabbed stretch
const BUTTON_LIFT = 0.3; // z-force magnitude (acceleration per substep)
const LIFT_SPAN = 20; // nodes each side of the grab the force covers
const LEFT_LIFTS_UP = true; // left button = +z (over), right = -z; flip to invert

// ── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// ── Shared state ─────────────────────────────────────────────────────────────
let points = []; // [{ x, y, z, px, py, pz }, ...]
let restLen = 0; // segment rest length (same for all segments)
let bendRest = []; // rest distances for bending pairs (i → i+2)
let crossings = []; // [{ pA, pB, point }] — over/under is read from z, not stored
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
