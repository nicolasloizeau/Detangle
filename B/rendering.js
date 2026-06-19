// Rope color channel (gray, so a single value suffices)
const ROPE_V = parseInt(COLOR_ROPE.slice(1), 16) & 0xff;

function drawRope(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = COLOR_ROPE;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

// Redraw a polyline arc segment-by-segment with cosine-weighted brightness,
// fading from rope color at the edges to `factor` at the center.
function drawArc(ctx, pts, pos, halfSegs, factor) {
  const n = pts.length;
  const start = Math.floor(pos - halfSegs);
  const end = Math.ceil(pos + halfSegs);
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "butt";
  for (let k = start; k < end; k++) {
    const iA = ((k % n) + n) % n;
    const iB = (iA + 1) % n;
    const t = Math.cos((Math.PI * (k + 0.5 - pos)) / halfSegs) * 0.5 + 0.5; // 1 at center, 0 at edge
    const f = 1 + (factor - 1) * t;
    const v = Math.min(255, Math.max(0, ROPE_V * f)) | 0;
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.moveTo(pts[iA].x, pts[iA].y);
    ctx.lineTo(pts[iB].x, pts[iB].y);
    ctx.stroke();
  }
}

// Two-pass crossing overlay drawn after drawRope.
// Pass 1: redraw under-strand then over-strand with a gradient over RENDER_CROSSING_LENGTH.
// Pass 2: redraw over-strand with a tighter gradient to assert it sits on top.
function drawCrossings(ctx, pts, crs) {
  const halfSegs1 = RENDER_CROSSING_LENGTH / (2 * restLen);
  const halfSegs2 = RENDER_CROSSING_LENGTH_2 / (2 * restLen);
  for (const c of crs) {
    drawArc(ctx, pts, c.underPos, halfSegs1, CROSSING_DARK_FACTOR);
    drawArc(ctx, pts, c.overPos, halfSegs1, CROSSING_LIGHT_FACTOR);
  }
  for (const c of crs) {
    drawArc(ctx, pts, c.overPos, halfSegs2, CROSSING_LIGHT_FACTOR);
  }
}

function render() {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRope(ctx, points);
  drawCrossings(ctx, points, crossings);
}
