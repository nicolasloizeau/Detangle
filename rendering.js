const ROPE_V = parseInt(COLOR_ROPE.slice(1), 16) & 0xff;

// Pre-computed palette: eliminates string creation per segment
const _grayPalette = Array.from({ length: 256 }, (_, v) => `rgb(${v},${v},${v})`);

// Pre-allocated sort buffers
const _drawOrder = new Int32Array(N_POINTS);
const _segZ      = new Float64Array(N_POINTS);
for (let i = 0; i < N_POINTS; i++) _drawOrder[i] = i;

// Painter's algorithm with color batching.
// Segments sorted by Z, then consecutive same-color segments share one stroke() call.
// Reduces GPU flushes from N_POINTS to at most the number of distinct gray values.
function drawRope() {
  const n = points.length;

  for (let i = 0; i < n - 1; i++) _segZ[i] = points[i].z + points[i + 1].z;
  _segZ[n - 1] = points[n - 1].z + points[0].z;
  _drawOrder.sort((a, b) => _segZ[a] - _segZ[b]);

  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  let lastColor = null;

  for (let k = 0; k < n; k++) {
    const i = _drawOrder[k];
    const a = points[i], b = points[i < n - 1 ? i + 1 : 0];
    const v = Math.min(255, Math.max(0, ROPE_V * (1 + (a.z + b.z) * 0.5 / Z_COLOR_RANGE))) | 0;
    const color = _grayPalette[v];

    if (color !== lastColor) {
      if (lastColor !== null) ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = color;
      lastColor = color;
    }

    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  if (lastColor !== null) ctx.stroke();
}

function drawOverlaps() {
  if (overlappingPoints.size === 0) return;
  ctx.fillStyle = 'red';
  for (const i of overlappingPoints) {
    const p = points[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, SPHERE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(camScale, 0, 0, camScale, camX, camY);
  drawRope();
  if (DEBUG) drawOverlaps();
  ctx.restore();
  if (DEBUG) drawDiagnostics();
}
