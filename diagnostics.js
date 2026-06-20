// ── Self-collision diagnostics ────────────────────────────────────────────────
// Measures the two root causes of failed self-collision prevention.
// Call updateDiagnostics(points) at the end of update().
// Call drawDiagnostics()        at the end of render().

let diagOverlapCount = 0;   // overlapping pairs remaining after all corrections
let diagMaxDisp = 0;        // max point displacement observed this frame (px/substep)

// Brute-force O(n²) overlap scan — intentionally independent of the spatial grid
// so it can catch anything the grid misses.
function countOverlaps(rope) {
  let count = 0;
  const n = rope.length;
  const minDistSq = (SPHERE_RADIUS * 2) ** 2;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.min(j - i, n - (j - i)) <= HARD_SPHERE_IGNORE_STEPS) continue;
      const dx = rope[j].x - rope[i].x;
      const dy = rope[j].y - rope[i].y;
      const dz = rope[j].z - rope[i].z;
      if (dx * dx + dy * dy + dz * dz < minDistSq) count++;
    }
  }
  return count;
}

// Called at the end of each update() — after all substeps and corrections.
// (x - px) is the displacement from the last Verlet step, a proxy for velocity.
function updateDiagnostics(rope) {
  let maxDisp = 0;
  for (const p of rope) {
    const d = Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz);
    if (d > maxDisp) maxDisp = d;
  }
  diagMaxDisp = maxDisp;
  diagOverlapCount = countOverlaps(rope);
}

function drawDiagnostics() {
  const threshold = SPHERE_RADIUS * 2; // max safe displacement before tunneling
  const tunneling = diagMaxDisp > threshold;
  const overlapping = diagOverlapCount > 0;

  ctx.save();
  ctx.font = "13px monospace";
  ctx.textBaseline = "top";

  // Overlap count — green if 0, red if any remain after correction
  ctx.fillStyle = overlapping ? "#ff4444" : "#44ff88";
  ctx.fillText(`overlaps after correction: ${diagOverlapCount}`, 12, 16);

  // Max displacement vs tunneling threshold
  ctx.fillStyle = tunneling ? "#ff4444" : "#44ff88";
  ctx.fillText(
    `max disp/substep: ${diagMaxDisp.toFixed(1)} px   tunnel threshold: ${threshold.toFixed(1)} px   ${tunneling ? "TUNNELING" : "ok"}`,
    12, 34
  );

  // Diagnosis
  ctx.fillStyle = "#aaaaaa";
  if (tunneling && overlapping) {
    ctx.fillText("diagnosis: tunneling (increase SUBSTEPS or SPHERE_RADIUS)", 12, 52);
  } else if (!tunneling && overlapping) {
    ctx.fillText("diagnosis: correction undone by length constraints (move applySelfCollision inside constraint loop)", 12, 52);
  } else if (!overlapping) {
    ctx.fillText("diagnosis: sphere overlap = 0 — if rope still crosses, SPHERE_RADIUS is too small for segment gaps", 12, 52);
  }

  ctx.restore();
}
