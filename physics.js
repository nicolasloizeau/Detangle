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
  restLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  bendRest = points.map((p, i) => {
    const q = points[(i + 2) % N_POINTS];
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
  });
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
      points[dragged].x = dragTargetX;
      points[dragged].y = dragTargetY;
    }
    if ((iter + 1) % COLLISION_ITER_INTERVAL === 0 || iter === CONSTRAINT_ITER - 1) {
      if (iter === CONSTRAINT_ITER - 1) overlappingPoints.clear();
      collisionPass(points);
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
  updateTangle(); // advance tangle state once per frame
  for (let s = 0; s < SUBSTEPS; s++) {
    if (dragged !== null) {
      const tx = tangling ? tangleDestX : mouseX;
      const ty = tangling ? tangleDestY : mouseY;
      const speed = tangling ? TANGLE_DRAG_SPEED : DRAG_MAX_SPEED;
      const dx = tx - dragTargetX, dy = ty - dragTargetY;
      const dist = Math.hypot(dx, dy);
      if (dist > speed) {
        dragTargetX += dx / dist * speed;
        dragTargetY += dy / dist * speed;
      } else {
        dragTargetX = tx;
        dragTargetY = ty;
      }
    }
    integrate();
    applyLift();
    buildSelfCollisionGrid(points);
    solveConstraints();
    applyZDynamics();
  }
  updateDiagnostics(points);
}
