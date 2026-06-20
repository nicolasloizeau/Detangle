// ── CCD: topology-preserving crossing constraint ──────────────────────────────
// Each substep, finds XY segment crossings that did NOT exist last substep.
// A new crossing is only corrected if the z separation at the crossing point is
// below Z_CROSSING_MIN_SEP — meaning both strands are at the same height, i.e.
// one is passing THROUGH the other rather than going over or under it.
// If z separation is adequate the crossing is a valid over/under and is allowed.
//
// When correcting: push the four endpoints back to the correct side AND zero the
// velocity component pointing across the crossing line, so integrate() does not
// carry the crossing momentum into the next substep.
//
// Uses integer grid keys (no string allocation).
// Depends on: segmentIntersect, gridCellSize.

let _prevCrossings = new Set(); // integer keys of crossings from the previous substep

function _buildSegGrid(rope) {
  const grid = new Map();
  const n = rope.length;
  const cs = gridCellSize;
  for (let i = 0; i < n; i++) {
    const a = rope[i], b = rope[(i + 1) % n];
    const cx0 = Math.floor(Math.min(a.x, b.x) / cs);
    const cy0 = Math.floor(Math.min(a.y, b.y) / cs);
    const cx1 = Math.floor(Math.max(a.x, b.x) / cs);
    const cy1 = Math.floor(Math.max(a.y, b.y) / cs);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = cx + cy * 65536; // integer key — no string allocation
        let cell = grid.get(key);
        if (!cell) grid.set(key, (cell = []));
        cell.push(i);
      }
    }
  }
  return grid;
}

// Returns a Map: integer pair key → segmentIntersect hit (with .ti, .tj).
function _buildCrossingMap(rope) {
  const n = rope.length;
  const grid = _buildSegGrid(rope);
  const seen = new Set();
  const out  = new Map();
  for (const segs of grid.values()) {
    for (let a = 0; a < segs.length; a++) {
      for (let b = a + 1; b < segs.length; b++) {
        const lo = Math.min(segs[a], segs[b]);
        const hi = Math.max(segs[a], segs[b]);
        const key = lo * n + hi;
        if (seen.has(key)) continue;
        seen.add(key);
        const hit = segmentIntersect(rope, lo, hi);
        if (hit) out.set(key, hit);
      }
    }
  }
  return out;
}

// Push P1 and P2 back to the side of line L1–L2 where they were last substep.
// Also cancels the velocity component pointing back across the line.
function _pushToCorrectSide(P1, P2, L1, L2) {
  // Use L's previous direction as the reference normal
  const lx = L2.px - L1.px, ly = L2.py - L1.py;
  const len = Math.hypot(lx, ly);
  if (len < 1e-9) return;
  const nx = -ly / len, ny = lx / len;

  // Which side of L were P1/P2 on before this substep?
  const pd1 = (P1.px - L1.px) * nx + (P1.py - L1.py) * ny;
  const pd2 = (P2.px - L1.px) * nx + (P2.py - L1.py) * ny;
  const side = Math.sign(pd1 + pd2);
  if (side === 0) return; // degenerate

  const gap = 1; // 1 px separation margin

  // P1
  const cd1 = (P1.x - L1.px) * nx + (P1.y - L1.py) * ny;
  if (cd1 * side < gap) {
    const push = (gap - cd1 * side) * side;
    P1.x += nx * push; P1.y += ny * push;
    // Cancel only the crossing velocity component (leave tangential velocity intact)
    const vn = (P1.x - P1.px) * nx + (P1.y - P1.py) * ny;
    if (vn * side < 0) { P1.px += vn * nx; P1.py += vn * ny; }
  }

  // P2
  const cd2 = (P2.x - L1.px) * nx + (P2.y - L1.py) * ny;
  if (cd2 * side < gap) {
    const push = (gap - cd2 * side) * side;
    P2.x += nx * push; P2.y += ny * push;
    const vn = (P2.x - P2.px) * nx + (P2.y - P2.py) * ny;
    if (vn * side < 0) { P2.px += vn * nx; P2.py += vn * ny; }
  }
}

function _uncross(rope, si, sj) {
  const n = rope.length;
  const A1 = rope[si],       A2 = rope[(si + 1) % n];
  const B1 = rope[sj],       B2 = rope[(sj + 1) % n];
  _pushToCorrectSide(A1, A2, B1, B2);
  _pushToCorrectSide(B1, B2, A1, A2);
}

// Call once per substep, after solveConstraints().
function applyCrossingCCD(rope) {
  const n = rope.length;
  const curr = _buildCrossingMap(rope);

  for (const [key, hit] of curr) {
    if (_prevCrossings.has(key)) continue; // pre-existing crossing — leave it alone

    // New crossing: check z separation at the crossing point
    const si = Math.floor(key / n), sj = key % n;
    const zA = rope[si].z * (1 - hit.ti) + rope[(si + 1) % n].z * hit.ti;
    const zB = rope[sj].z * (1 - hit.tj) + rope[(sj + 1) % n].z * hit.tj;

    if (Math.abs(zA - zB) < Z_CROSSING_MIN_SEP) {
      // Strands at the same height: this is a pass-through, not an over/under — block it
      _uncross(rope, si, sj);
    }
    // else: adequate z separation means the user lifted one strand → valid crossing, allow it
  }

  _prevCrossings = new Set(curr.keys());
}
