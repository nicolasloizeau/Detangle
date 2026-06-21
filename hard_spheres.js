// ── 3D hard sphere self-collision ─────────────────────────────────────────────
// Grid built once per substep. Two passes:
//  - collisionPass: position correction only, inside the constraint loop.
//  - frictionPass:  velocity correction only, once after all constraints.

const _grid = new Map();
const overlappingPoints = new Set();

// Cell array pool: reused across grid rebuilds to avoid per-substep allocation
const _cellPool = [];
let _poolSize = 0;

function buildSelfCollisionGrid(rope) {
  _grid.clear();
  _poolSize = 0;
  const diameter = SPHERE_RADIUS * 2;
  for (let i = 0; i < rope.length; i++) {
    const p = rope[i];
    const key = Math.floor(p.x / diameter) + Math.floor(p.y / diameter) * 65536;
    let cell = _grid.get(key);
    if (!cell) {
      cell = _poolSize < _cellPool.length ? _cellPool[_poolSize] : (_cellPool[_poolSize] = []);
      cell.length = 0;
      _poolSize++;
      _grid.set(key, cell);
    }
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
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const cell = _grid.get(gx + gy * 65536);
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          const d = j - i;
          if (d <= HARD_SPHERE_IGNORE_STEPS || n - d <= HARD_SPHERE_IGNORE_STEPS) continue;
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

function frictionPass(rope) {
  const n = rope.length;
  const diameter = SPHERE_RADIUS * 2;
  const frictionSq = (diameter * FRICTION_RADIUS_FACTOR) ** 2;

  for (let i = 0; i < n; i++) {
    const pi = rope[i];
    const cx = Math.floor(pi.x / diameter);
    const cy = Math.floor(pi.y / diameter);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const cell = _grid.get(gx + gy * 65536);
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          const d = j - i;
          if (d <= HARD_SPHERE_IGNORE_STEPS || n - d <= HARD_SPHERE_IGNORE_STEPS) continue;
          const pj = rope[j];
          const dx = pj.x - pi.x, dy = pj.y - pi.y, dz = pj.z - pi.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq >= frictionSq) continue;

          const dist = Math.sqrt(distSq) || 1e-9;
          const nx = dx / dist, ny = dy / dist, nz = dz / dist;
          const rvx = (pj.x - pj.px) - (pi.x - pi.px);
          const rvy = (pj.y - pj.py) - (pi.y - pi.py);
          const rvz = (pj.z - pj.pz) - (pi.z - pi.pz);
          const rvn = rvx * nx + rvy * ny + rvz * nz;
          const tvx = rvx - rvn * nx;
          const tvy = rvy - rvn * ny;
          const tvz = rvz - rvn * nz;
          const f = CONTACT_FRICTION * 0.5;
          pi.px -= tvx * f;  pi.py -= tvy * f;  pi.pz -= tvz * f;
          pj.px += tvx * f;  pj.py += tvy * f;  pj.pz += tvz * f;
        }
      }
    }
  }
}
