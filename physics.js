// ── Setup: circle initialization ─────────────────────────────────────────────
function initCircle() {
  points = [];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = Math.min(canvas.width, canvas.height) * CIRCLE_RADIUS;
  for (let i = 0; i < N_POINTS; i++) {
    const a = (2 * Math.PI * i) / N_POINTS;
    const rr = r * (1 + WIGGLE_AMPLITUDE * Math.sin(WIGGLE_FREQUENCY * a));
    const x = cx + rr * Math.cos(a);
    const y = cy + rr * Math.sin(a);
    points.push({ x, y, z: 0, px: x, py: y, pz: 0 });
  }
  segRest = points.map((p, i) => {
    const q = points[(i + 1) % N_POINTS];
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
  });
  bendRest = points.map((p, i) => {
    const q = points[(i + 2) % N_POINTS];
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
  });
  for (let i = 0; i < N_POINTS; i++) {
    _segRest2[i]  = segRest[i]  * segRest[i];
    _bendRest2[i] = bendRest[i] * bendRest[i];
  }
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
// Precomputed squared rest lengths — avoids target*target per applyDist call.
const _segRest2  = new Float64Array(N_POINTS);
const _bendRest2 = new Float64Array(N_POINTS);

// Full applyDist used only for the dragged case and bending constraints.
function applyDist(a, b, target, targetSq, stiffness, aPinned, bPinned) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (Math.abs(distSq - targetSq) < targetSq * 1e-3) return;
  const dist = Math.sqrt(distSq) || 1e-9;
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

    if (dragged === null) {
      // ── Fast path: no pinning — inline segment constraints, skip branch checks ──
      for (let i = 0; i < n - 1; i++) {
        const a = points[i], b = points[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const tSq = _segRest2[i];
        if (Math.abs(distSq - tSq) < tSq * 1e-3) continue;
        const dist = Math.sqrt(distSq) || 1e-9;
        const c = (dist - segRest[i]) / dist * 0.5;
        a.x += dx * c;  a.y += dy * c;  a.z += dz * c;
        b.x -= dx * c;  b.y -= dy * c;  b.z -= dz * c;
      }
      { // wrap segment n-1 → 0
        const a = points[n - 1], b = points[0];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const tSq = _segRest2[n - 1];
        if (Math.abs(distSq - tSq) >= tSq * 1e-3) {
          const dist = Math.sqrt(distSq) || 1e-9;
          const c = (dist - segRest[n - 1]) / dist * 0.5;
          a.x += dx * c;  a.y += dy * c;  a.z += dz * c;
          b.x -= dx * c;  b.y -= dy * c;  b.z -= dz * c;
        }
      }
      if (iter & 1) {
        for (let i = 0; i < n - 2; i++)
          applyDist(points[i], points[i + 2], bendRest[i], _bendRest2[i], BEND_STIFFNESS, false, false);
        applyDist(points[n-2], points[0], bendRest[n-2], _bendRest2[n-2], BEND_STIFFNESS, false, false);
        applyDist(points[n-1], points[1], bendRest[n-1], _bendRest2[n-1], BEND_STIFFNESS, false, false);
      }
    } else {
      // ── Slow path: one point is pinned — use full applyDist with pin checks ──
      for (let i = 0; i < n - 1; i++)
        applyDist(points[i], points[i+1], segRest[i], _segRest2[i], 1, i===dragged, i+1===dragged);
      applyDist(points[n-1], points[0], segRest[n-1], _segRest2[n-1], 1, n-1===dragged, 0===dragged);
      if (iter & 1) {
        for (let i = 0; i < n - 2; i++)
          applyDist(points[i], points[i+2], bendRest[i], _bendRest2[i], BEND_STIFFNESS, i===dragged, i+2===dragged);
        applyDist(points[n-2], points[0], bendRest[n-2], _bendRest2[n-2], BEND_STIFFNESS, n-2===dragged, 0===dragged);
        applyDist(points[n-1], points[1], bendRest[n-1], _bendRest2[n-1], BEND_STIFFNESS, n-1===dragged, 1===dragged);
      }
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
const _zBuf = new Float64Array(N_POINTS); // pre-allocated, avoids per-substep array creation

function applyZDynamics() {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    points[i].z *= (1 - Z_GROUND);
    _zBuf[i] = points[i].z;
  }
  points[0].z += Z_STIFFNESS * ((_zBuf[n - 1] + _zBuf[1]) * 0.5 - _zBuf[0]);
  for (let i = 1; i < n - 1; i++)
    points[i].z += Z_STIFFNESS * ((_zBuf[i - 1] + _zBuf[i + 1]) * 0.5 - _zBuf[i]);
  points[n - 1].z += Z_STIFFNESS * ((_zBuf[n - 2] + _zBuf[0]) * 0.5 - _zBuf[n - 1]);
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
    frictionPass(points);
    applyZDynamics();
  }
  updateDiagnostics(points);
}
