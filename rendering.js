// Rope gray value at z=0 (gray, so a single channel suffices)
const ROPE_V = parseInt(COLOR_ROPE.slice(1), 16) & 0xff;

// Height → gray value: higher z brighter, lower z darker (clamped to 0..255).
function zToValue(z) {
  return Math.min(255, Math.max(0, ROPE_V * (1 + z / Z_COLOR_RANGE)));
}

// Set the stroke to a gray, clamped to a valid 0..255 byte.
function grayStroke(v) {
  v = Math.min(255, Math.max(0, v)) | 0;
  ctx.strokeStyle = `rgb(${v},${v},${v})`;
}

// Draw the rope segment-by-segment, each segment shaded by its mean height.
function drawRope() {
  const n = points.length;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const a = points[i],
      b = points[(i + 1) % n];
    grayStroke(zToValue((a.z + b.z) * 0.5));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

// Redraw an arc segment-by-segment, cosine-fading its z-based color toward `factor`
// (brighter/darker) at the center to emphasize an over/under strand.
function drawArc(pos, halfSegs, factor) {
  const n = points.length;
  const start = Math.floor(pos - halfSegs);
  const end = Math.ceil(pos + halfSegs);
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "butt";
  for (let k = start; k < end; k++) {
    const iA = ((k % n) + n) % n;
    const iB = (iA + 1) % n;
    const t = Math.cos((Math.PI * (k + 0.5 - pos)) / halfSegs) * 0.5 + 0.5; // 1 at center, 0 at edge
    const f = 1 + (factor - 1) * t;
    grayStroke(zToValue((points[iA].z + points[iB].z) * 0.5) * f);
    ctx.beginPath();
    ctx.moveTo(points[iA].x, points[iA].y);
    ctx.lineTo(points[iB].x, points[iB].y);
    ctx.stroke();
  }
}

// Crossing overlay drawn after drawRope; over strand = the higher-z one.
// Pass 1: redraw under then over with a gradient over RENDER_CROSSING_LENGTH.
// Pass 2: redraw all overs again, tighter, so they sit clearly on top.
function drawCrossings() {
  const halfSegs1 = RENDER_CROSSING_LENGTH / (2 * restLen);
  const halfSegs2 = RENDER_CROSSING_LENGTH_2 / (2 * restLen);
  const ou = crossings.map((c) => {
    const aOver = strandZ(points, c.pA) >= strandZ(points, c.pB);
    return { over: aOver ? c.pA : c.pB, under: aOver ? c.pB : c.pA };
  });
  for (const { over, under } of ou) {
    drawArc(under, halfSegs1, CROSSING_DARK_FACTOR);
    drawArc(over, halfSegs1, CROSSING_LIGHT_FACTOR);
  }
  for (const { over } of ou) drawArc(over, halfSegs2, CROSSING_LIGHT_FACTOR);
}

function render() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRope();
  drawCrossings();
}
