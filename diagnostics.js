// ── Diagnostics HUD ───────────────────────────────────────────────────────────
// Call updateDiagnostics(points) at the end of update().
// Call drawDiagnostics()        inside render() when DEBUG is true.
// Call updateFPS() + drawFPS()  every frame (always visible).

// ── FPS counter ───────────────────────────────────────────────────────────────
const _FPS_WINDOW = 60; // frames in the moving average
const _fpsSamples = new Float64Array(_FPS_WINDOW);
let _fpsHead = 0, _fpsCount = 0, _fpsLast = 0;

function updateFPS() {
  const now = performance.now();
  if (_fpsLast > 0) {
    _fpsSamples[_fpsHead] = 1000 / (now - _fpsLast);
    _fpsHead = (_fpsHead + 1) % _FPS_WINDOW;
    if (_fpsCount < _FPS_WINDOW) _fpsCount++;
  }
  _fpsLast = now;
}

function drawFPS() {
  let sum = 0;
  for (let i = 0; i < _fpsCount; i++) sum += _fpsSamples[i];
  const fps = _fpsCount > 0 ? sum / _fpsCount : 0;

  ctx.save();
  ctx.font = "13px monospace";
  ctx.textBaseline = "top";
  ctx.textAlign = "right";
  ctx.fillStyle = fps >= 55 ? "#44ff88" : fps >= 30 ? "#ffaa44" : "#ff4444";
  ctx.fillText(`${fps.toFixed(1)} fps`, canvas.width - 12, 12);
  ctx.restore();
}

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
