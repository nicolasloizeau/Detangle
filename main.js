// ── Config ───────────────────────────────────────────────────────────────────
const N_POINTS = 2048;
const CIRCLE_RADIUS = 0.3; // fraction of the smaller canvas dimension
const WIGGLE_AMPLITUDE = 0.5; // radial wiggle amplitude as fraction of circle radius
const WIGGLE_FREQUENCY = 13; // number of sine wiggles per revolution
const CONSTRAINT_ITER = 20;
const DAMPING = 0.8; // lower = more friction
const BEND_STIFFNESS = 0.3; // 0..1, resists sharp kinks
const SUBSTEPS = 16; // integration steps per frame
const GRAB_RADIUS = 30; // pixels

const LINE_WIDTH = 8;
const COLOR_BG = "#262626";
const COLOR_ROPE = "#A8A8A8"; // brightness at z=0; height shades it up/down
const Z_COLOR_RANGE = 10; // z at which the rope reaches full white (+) / black (−)

// ── Tangle ────────────────────────────────────────────────────────────────────
const TANGLE_STEPS = 30; // number of drag gestures per tangle sequence
const TANGLE_DRAG_SPEED = 15; // pixels per substep the drag target moves during tangle

// ── Debug ─────────────────────────────────────────────────────────────────────
const DEBUG = false; // show HUD and red overlap markers

// ── Drag ──────────────────────────────────────────────────────────────────────
const DRAG_MAX_SPEED = 10; // max px the drag target moves toward the cursor per substep

// ── Hard sphere self-collision ────────────────────────────────────────────────
const SPHERE_RADIUS = LINE_WIDTH; // collision sphere radius per rope point (px)
const HARD_SPHERE_IGNORE_STEPS = 12; // skip pairs within this many rope indices
const COLLISION_ITER_INTERVAL = 5; // run collisionPass every Nth constraint iteration
const CONTACT_FRICTION = 0.2; // tangential velocity damped per contact (0=frictionless, 1=full stop)
const FRICTION_RADIUS_FACTOR = 2; // friction applies up to this multiple of the sphere diameter

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
let segRest = []; // per-segment rest lengths  (i → i+1)
let bendRest = []; // per-segment rest lengths for bending pairs (i → i+2)
let dragged = null; // index of grabbed point, or null
let dragButton = null; // 0=left, 2=right, null=none
let mouseX = 0, mouseY = 0;
let dragTargetX = 0, dragTargetY = 0; // rate-limited proxy for the cursor position

// ── Camera (pan + zoom) ───────────────────────────────────────────────────────
let camX = 0, camY = 0, camScale = 1;
let panning = false;
let panStartX = 0, panStartY = 0, panStartCamX = 0, panStartCamY = 0;

// Screen → world coordinate conversion
function screenToWorld(sx, sy) {
  return { x: (sx - camX) / camScale, y: (sy - camY) / camScale };
}

// ── Input ─────────────────────────────────────────────────────────────────────
function screenPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function canvasPos(e) {
  const { x, y } = screenPos(e);
  return screenToWorld(x, y);
}

function nearestPoint(x, y) {
  let best = null, bestD = GRAB_RADIUS / camScale; // threshold in world space
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  if (tangling) return;
  ({ x: mouseX, y: mouseY } = canvasPos(e));
  dragged = nearestPoint(mouseX, mouseY);
  dragButton = e.button;
  if (dragged !== null) {
    dragTargetX = points[dragged].x;
    dragTargetY = points[dragged].y;
  } else {
    panning = true;
    const s = screenPos(e);
    panStartX = s.x; panStartY = s.y;
    panStartCamX = camX; panStartCamY = camY;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (tangling) return;
  if (panning) {
    const s = screenPos(e);
    camX = panStartCamX + (s.x - panStartX);
    camY = panStartCamY + (s.y - panStartY);
  }
  ({ x: mouseX, y: mouseY } = canvasPos(e));
});

window.addEventListener("mouseup", () => {
  if (tangling) return;
  dragged = null; dragButton = null; panning = false;
});
window.addEventListener("blur", () => {
  dragged = null; dragButton = null; panning = false; // always reset on focus loss
});

canvas.addEventListener("wheel", (e) => {
  if (tangling) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const s = screenPos(e);
  camX = s.x + (camX - s.x) * factor;
  camY = s.y + (camY - s.y) * factor;
  camScale = Math.max(0.1, Math.min(20, camScale * factor));
}, { passive: false });

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
