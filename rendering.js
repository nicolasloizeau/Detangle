// Rope gray value at z=0
const ROPE_V = parseInt(COLOR_ROPE.slice(1), 16) & 0xff;

// z → gray brightness: higher = brighter, lower = darker
function zToValue(z) {
  return Math.min(255, Math.max(0, ROPE_V * (1 + z / Z_COLOR_RANGE)));
}

function grayStroke(v) {
  v = Math.min(255, Math.max(0, v)) | 0;
  ctx.strokeStyle = `rgb(${v},${v},${v})`;
}

// Painter's algorithm: sort segments by mean Z, draw lowest first.
// Higher-Z segments draw on top, naturally producing correct over/under at crossings.
function drawRope() {
  const n = points.length;
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) =>
    (points[a].z + points[(a + 1) % n].z) - (points[b].z + points[(b + 1) % n].z)
  );
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const i of order) {
    const a = points[i], b = points[(i + 1) % n];
    grayStroke(zToValue((a.z + b.z) * 0.5));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
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
  drawRope();
  if (DEBUG) { drawOverlaps(); drawDiagnostics(); }
}
