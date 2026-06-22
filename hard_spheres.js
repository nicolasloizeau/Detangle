// ── 3D hard sphere self-collision ─────────────────────────────────────────────
// Flat Int32Array grid for O(1) cell lookup.
// Per-candidate j-list: rope-distance filtering done once per substep.
//   Each collision/friction pass still computes live distances from current
//   positions — only the 9-cell grid scan and rope-distance check are pre-built.
// Robustness trade-off vs fully-live approach: if candidate i drifts across a
//   cell boundary (>16 px) during constraint solving, new j's in the adjacent
//   cell are missed.  In practice per-iteration drift is small, so this is safe.

const _GW = 256, _GH = 256;
const _MC = 8;
const _ST = 1 + _MC;
const _flatGrid  = new Int32Array(_GW * _GH * _ST);
const _usedCells = new Uint32Array(N_POINTS);
let   _nUsed     = 0;

const _candidates  = new Uint16Array(N_POINTS);
let   _nCandidates = 0;

// Per-candidate j-list: for each candidate i, the rope-distance-valid j values
// (j > i, not rope-adjacent) found in i's 9-cell neighbourhood at build time.
// Passes iterate this list and do the live distance check themselves.
const _jList  = new Int32Array(N_POINTS * 32); // generous bound
const _jStart = new Uint32Array(N_POINTS + 1); // _jStart[ci] .. _jStart[ci+1]
let   _jTotal = 0;

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

  // Build candidate list and per-candidate j-list in one combined scan.
  _nCandidates = 0;
  _jTotal = 0;
  const n = rope.length;

  for (let i = 0; i < n; i++) {
    const pi = rope[i];
    const cx = Math.floor(pi.x / diameter);
    const cy = Math.floor(pi.y / diameter);
    if (cx < 0 || cx >= _GW || cy < 0 || cy >= _GH) continue;

    const jStart = _jTotal;

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
          if (_jTotal < _jList.length) _jList[_jTotal++] = j;
        }
      }
    }

    if (_jTotal > jStart) {          // at least one valid j found
      _jStart[_nCandidates] = jStart;
      _candidates[_nCandidates++] = i;
    } else {
      _jTotal = jStart;              // no j's — roll back (no candidate added)
    }
  }
  _jStart[_nCandidates] = _jTotal;  // sentinel
}

// Position correction — live distance check on pre-filtered j-list.
function collisionPass(rope) {
  const diameter = SPHERE_RADIUS * 2;
  const diamSq   = diameter * diameter;

  for (let ci = 0; ci < _nCandidates; ci++) {
    const i   = _candidates[ci];
    const pi  = rope[i];
    const end = _jStart[ci + 1];
    for (let jj = _jStart[ci]; jj < end; jj++) {
      const pj = rope[_jList[jj]];
      const dx = pj.x - pi.x, dy = pj.y - pi.y, dz = pj.z - pi.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < diamSq) {
        overlappingPoints.add(i);
        overlappingPoints.add(_jList[jj]);
        const dist = Math.sqrt(distSq) || 1e-9;
        const c = (diameter - dist) / dist * 0.5;
        pi.x -= dx * c;  pi.y -= dy * c;  pi.z -= dz * c;
        pj.x += dx * c;  pj.y += dy * c;  pj.z += dz * c;

        // Damp normal (approach) velocity — counters tension continuously
        // driving strands into each other even after position correction.
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        const rvn = ((pj.x - pj.px) - (pi.x - pi.px)) * nx
                  + ((pj.y - pj.py) - (pi.y - pi.py)) * ny
                  + ((pj.z - pj.pz) - (pi.z - pi.pz)) * nz;
        if (rvn < 0) { // only when approaching
          const imp = rvn * CONTACT_NORMAL_DAMPING * 0.5;
          pi.px -= nx * imp;  pi.py -= ny * imp;  pi.pz -= nz * imp;
          pj.px += nx * imp;  pj.py += ny * imp;  pj.pz += nz * imp;
        }
      }
    }
  }
}

// Friction — same j-list, live distances, larger threshold.
function frictionPass(rope) {
  const diameter   = SPHERE_RADIUS * 2;
  const frictionSq = (diameter * FRICTION_RADIUS_FACTOR) ** 2;

  for (let ci = 0; ci < _nCandidates; ci++) {
    const i   = _candidates[ci];
    const pi  = rope[i];
    const end = _jStart[ci + 1];
    for (let jj = _jStart[ci]; jj < end; jj++) {
      const pj = rope[_jList[jj]];
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
