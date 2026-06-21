// ── 3D hard sphere self-collision ─────────────────────────────────────────────
// Flat Int32Array grid: O(1) direct cell lookup, no Map overhead.
// Candidate list: built once per substep — only points with non-adjacent rope
//   neighbours in range enter the outer loop of each collision/friction pass.
// Each pass recomputes distances from CURRENT positions (not stale pairs),
//   so corrections are applied to whatever the constraint solver just produced.

const _GW = 256, _GH = 256;
const _MC = 8;
const _ST = 1 + _MC;
const _flatGrid  = new Int32Array(_GW * _GH * _ST);
const _usedCells = new Uint32Array(N_POINTS);
let   _nUsed     = 0;

const _candidates  = new Uint16Array(N_POINTS);
let   _nCandidates = 0;

const overlappingPoints = new Set();

function buildSelfCollisionGrid(rope) {
  for (let k = 0; k < _nUsed; k++) _flatGrid[_usedCells[k] * _ST] = 0;
  _nUsed = 0;
  const diameter = SPHERE_RADIUS * 2;
  for (let i = 0; i < rope.length; i++) {
    const p  = rope[i];
    const cx = Math.floor(p.x / diameter);
    const cy = Math.floor(p.y / diameter);
    if (cx < 0 || cx >= _GW || cy < 0 || cy >= _GH) continue;
    const cell = cx + cy * _GW;
    const base = cell * _ST;
    const cnt  = _flatGrid[base];
    if (cnt === 0) _usedCells[_nUsed++] = cell;
    if (cnt < _MC) { _flatGrid[base + 1 + cnt] = i; _flatGrid[base]++; }
  }

  // Candidate list: points that have at least one non-adjacent rope neighbour
  // in the 9-cell zone. Built once; reused by every pass this substep.
  _nCandidates = 0;
  const n = rope.length;
  for (let i = 0; i < n; i++) {
    const pi = rope[i];
    const cx = Math.floor(pi.x / diameter);
    const cy = Math.floor(pi.y / diameter);
    if (cx < 0 || cx >= _GW || cy < 0 || cy >= _GH) continue;
    search:
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      if (gx < 0 || gx >= _GW) continue;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        if (gy < 0 || gy >= _GH) continue;
        const base = (gx + gy * _GW) * _ST;
        const cnt  = _flatGrid[base];
        for (let k = 0; k < cnt; k++) {
          const j = _flatGrid[base + 1 + k];
          if (j === i) continue;
          const d = j > i ? j - i : i - j;
          if (d > HARD_SPHERE_IGNORE_STEPS && n - d > HARD_SPHERE_IGNORE_STEPS) {
            _candidates[_nCandidates++] = i;
            break search;
          }
        }
      }
    }
  }
}

// Position correction — uses CURRENT positions each call, catches drift from
// constraint iterations that happened after the grid was built.
function collisionPass(rope) {
  const n        = rope.length;
  const diameter = SPHERE_RADIUS * 2;
  const diamSq   = diameter * diameter;

  for (let ci = 0; ci < _nCandidates; ci++) {
    const i  = _candidates[ci];
    const pi = rope[i];
    const cx = Math.floor(pi.x / diameter);
    const cy = Math.floor(pi.y / diameter);

    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      if (gx < 0 || gx >= _GW) continue;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        if (gy < 0 || gy >= _GH) continue;
        const base = (gx + gy * _GW) * _ST;
        const cnt  = _flatGrid[base];
        for (let k = 0; k < cnt; k++) {
          const j = _flatGrid[base + 1 + k];
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

// Friction — same candidate list, larger distance threshold, uses current positions.
function frictionPass(rope) {
  const n          = rope.length;
  const diameter   = SPHERE_RADIUS * 2;
  const frictionSq = (diameter * FRICTION_RADIUS_FACTOR) ** 2;

  for (let ci = 0; ci < _nCandidates; ci++) {
    const i  = _candidates[ci];
    const pi = rope[i];
    const cx = Math.floor(pi.x / diameter);
    const cy = Math.floor(pi.y / diameter);

    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      if (gx < 0 || gx >= _GW) continue;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        if (gy < 0 || gy >= _GH) continue;
        const base = (gx + gy * _GW) * _ST;
        const cnt  = _flatGrid[base];
        for (let k = 0; k < cnt; k++) {
          const j = _flatGrid[base + 1 + k];
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
          const tvx = rvx - rvn * nx, tvy = rvy - rvn * ny, tvz = rvz - rvn * nz;
          const f = CONTACT_FRICTION * 0.5;
          pi.px -= tvx * f;  pi.py -= tvy * f;  pi.pz -= tvz * f;
          pj.px += tvx * f;  pj.py += tvy * f;  pj.pz += tvz * f;
        }
      }
    }
  }
}
