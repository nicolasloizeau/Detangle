// ── Diagnostics HUD ───────────────────────────────────────────────────────────
// Call updateDiagnostics(points) at the end of update().
// Call drawDiagnostics()        inside render() when DEBUG is true.

let diagOverlapCount = 0;
let diagMaxDisp = 0;

function updateDiagnostics(rope) {
  let maxDisp = 0;
  for (const p of rope) {
    const d = Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz);
    if (d > maxDisp) maxDisp = d;
  }
  diagMaxDisp = maxDisp;
  diagOverlapCount = overlappingPoints.size;
}

function drawDiagnostics() {
  const threshold = SPHERE_RADIUS * 2;
  const tunneling = diagMaxDisp > threshold;
  const overlapping = diagOverlapCount > 0;

  ctx.save();
  ctx.font = "13px monospace";
  ctx.textBaseline = "top";

  ctx.fillStyle = overlapping ? "#ff4444" : "#44ff88";
  ctx.fillText(`overlapping points: ${diagOverlapCount}`, 12, 16);

  ctx.fillStyle = tunneling ? "#ff4444" : "#44ff88";
  ctx.fillText(
    `max disp/substep: ${diagMaxDisp.toFixed(1)} px   threshold: ${threshold.toFixed(1)} px   ${tunneling ? "TUNNELING" : "ok"}`,
    12, 34
  );

  ctx.restore();
}
