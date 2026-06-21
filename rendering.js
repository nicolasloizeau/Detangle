const ROPE_V = parseInt(COLOR_ROPE.slice(1), 16) & 0xff;

// Pre-computed gray string palette — no string allocation per segment
const _grayPalette = Array.from({ length: 256 }, (_, v) => `rgb(${v},${v},${v})`);

// Counting sort buffers — O(n + 256) instead of O(n log n) comparison sort
const _segGray   = new Uint8Array(N_POINTS);
const _grayCount = new Uint32Array(256);
const _grayStart = new Uint32Array(256);
const _sortOut   = new Int32Array(N_POINTS);

const _zScale = ROPE_V * 0.5 / Z_COLOR_RANGE; // pre-multiplied constant for z→gray

function drawRope() {
  const n = points.length;

  // Compute gray per segment + build histogram in one pass
  _grayCount.fill(0);
  for (let i = 0; i < n - 1; i++) {
    const g = Math.min(255, Math.max(0, ROPE_V + (points[i].z + points[i + 1].z) * _zScale)) | 0;
    _segGray[i] = g;
    _grayCount[g]++;
  }
  const gLast = Math.min(255, Math.max(0, ROPE_V + (points[n - 1].z + points[0].z) * _zScale)) | 0;
  _segGray[n - 1] = gLast;
  _grayCount[gLast]++;

  // Counting sort
  let pos = 0;
  for (let g = 0; g < 256; g++) { _grayStart[g] = pos; pos += _grayCount[g]; _grayCount[g] = 0; }
  for (let i = 0; i < n; i++) {
    const g = _segGray[i];
    _sortOut[_grayStart[g] + _grayCount[g]++] = i;
  }

  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round"; // smooth joins inside polylines
  ctx.lineCap  = "round"; // fills gaps between segments at color-group boundaries

  let lastG   = -1; // current color group
  let lastEnd = -1; // rope index of last drawn segment's far endpoint

  for (let k = 0; k < n; k++) {
    const i  = _sortOut[k];
    const g  = _segGray[i];
    const ni = i < n - 1 ? i + 1 : 0;
    const a  = points[i], b = points[ni];

    if (g !== lastG) {
      if (lastG >= 0) ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = _grayPalette[g];
      lastG   = g;
      lastEnd = -1;
    }

    if (lastEnd === i) {
      ctx.lineTo(b.x, b.y); // extend existing polyline — no moveTo needed
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    lastEnd = ni;
  }

  if (lastG >= 0) ctx.stroke();
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
  updateFPS();
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(camScale, 0, 0, camScale, camX, camY);
  drawRope();
  if (DEBUG) drawOverlaps();
  ctx.restore();
  drawFPS();
  if (DEBUG) drawDiagnostics();
}
