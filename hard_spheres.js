// ── 3D hard sphere self-collision ─────────────────────────────────────────────
// Performance notes:
//  - One pre-allocated Map, cleared and reused every substep (no GC pressure).
//  - Integer cell keys (cx + cy * 65536) instead of strings — no allocation.
//  - 2D grid (x/y only): z is small relative to cellSize so no pairs are missed.
//    Full 3D distance is still checked before applying any correction.
//  - Called once per substep with SELF_COLLISION_PASSES inner loops, not once
//    per constraint iteration (was 30× more expensive).

const _grid = new Map();
const overlappingPoints = new Set(); // populated during the last correction pass, read by rendering

function buildSelfCollisionGrid(rope) {
  _grid.clear();
  const cellSize = SPHERE_RADIUS * 2;
  for (let i = 0; i < rope.length; i++) {
    const p = rope[i];
    const key = Math.floor(p.x / cellSize) + Math.floor(p.y / cellSize) * 65536;
    let cell = _grid.get(key);
    if (!cell) _grid.set(key, (cell = []));
    cell.push(i);
  }
}

function collisionPass(rope) {
  const n = rope.length;
  const cellSize = SPHERE_RADIUS * 2;
  const minDist = SPHERE_RADIUS * 2;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < n; i++) {
    const pi = rope[i];
    const cx = Math.floor(pi.x / cellSize);
    const cy = Math.floor(pi.y / cellSize);

    for (let nx = cx - 1; nx <= cx + 1; nx++) {
      for (let ny = cy - 1; ny <= cy + 1; ny++) {
        const cell = _grid.get(nx + ny * 65536);
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          if (Math.min(j - i, n - (j - i)) <= HARD_SPHERE_IGNORE_STEPS) continue;

          const pj = rope[j];
          const dx = pj.x - pi.x;
          const dy = pj.y - pi.y;
          const dz = pj.z - pi.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < minDistSq) {
            overlappingPoints.add(i);
            overlappingPoints.add(j);
            // Isotropic separation: push each sphere half the overlap along the
            // vector connecting their centers. X, Y, Z are treated identically.
            const dist = Math.sqrt(distSq) || 1e-9;
            const correction = (minDist - dist) / dist * 0.5;
            pi.x -= dx * correction;  pi.y -= dy * correction;  pi.z -= dz * correction;
            pj.x += dx * correction;  pj.y += dy * correction;  pj.z += dz * correction;
          }
        }
      }
    }
  }
}

function applySelfCollision(rope) {
  buildSelfCollisionGrid(rope);
  for (let pass = 0; pass < SELF_COLLISION_PASSES; pass++) {
    if (pass === SELF_COLLISION_PASSES - 1) overlappingPoints.clear(); // only keep last pass
    collisionPass(rope);
  }
}
