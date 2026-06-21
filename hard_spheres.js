// ── 3D hard sphere self-collision ─────────────────────────────────────────────
// Grid built once per substep (buildSelfCollisionGrid), then collisionPass is
// called inside the constraint loop so corrections interleave with propagation.
// Integer cell keys (no string allocation), 2D grid (z checked in distance test).

const _grid = new Map();
const overlappingPoints = new Set(); // populated on the last collisionPass, read by rendering

function buildSelfCollisionGrid(rope) {
  _grid.clear();
  const diameter = SPHERE_RADIUS * 2;
  for (let i = 0; i < rope.length; i++) {
    const p = rope[i];
    const key = Math.floor(p.x / diameter) + Math.floor(p.y / diameter) * 65536;
    let cell = _grid.get(key);
    if (!cell) _grid.set(key, (cell = []));
    cell.push(i);
  }
}

function collisionPass(rope) {
  const n = rope.length;
  const diameter = SPHERE_RADIUS * 2;
  const diamSq = diameter * diameter;

  for (let i = 0; i < n; i++) {
    const pi = rope[i];
    const cx = Math.floor(pi.x / diameter);
    const cy = Math.floor(pi.y / diameter);

    for (let nx = cx - 1; nx <= cx + 1; nx++) {
      for (let ny = cy - 1; ny <= cy + 1; ny++) {
        const cell = _grid.get(nx + ny * 65536);
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          if (Math.min(j - i, n - (j - i)) <= HARD_SPHERE_IGNORE_STEPS) continue;

          const pj = rope[j];
          const dx = pj.x - pi.x, dy = pj.y - pi.y, dz = pj.z - pi.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < diamSq) {
            overlappingPoints.add(i);
            overlappingPoints.add(j);
            const dist = Math.sqrt(distSq) || 1e-9;
            const c = (diameter - dist) / dist * 0.5;
            pi.x -= dx * c;  pi.y -= dy * c;  pi.z -= dz * c;
            pj.x += dx * c;  pj.y += dy * c;  pj.z += dz * c;
          }
        }
      }
    }
  }
}
