// ── Tangle: automated rope tangling sequence ──────────────────────────────────
// Each step picks a random rope point and drags it to a random screen position
// with a random up/down lift, simulating fast mouse drags without moving the cursor.

let tangling = false;
let tangleStepsLeft = 0;
let tangleDestX = 0, tangleDestY = 0;

function startTangle() {
  tangling = true;
  tangleStepsLeft = TANGLE_STEPS;
  _nextTangleStep();
}

function _nextTangleStep() {
  if (tangleStepsLeft <= 0) {
    tangling = false;
    dragged = null;
    dragButton = null;
    _updateTangleButton();
    return;
  }
  tangleStepsLeft--;
  dragged = Math.floor(Math.random() * N_POINTS);
  dragTargetX = points[dragged].x;
  dragTargetY = points[dragged].y;
  tangleDestX = Math.random() * canvas.width;
  tangleDestY = Math.random() * canvas.height;
  dragButton = Math.random() < 0.5 ? 0 : 2; // 0 = left (lift up), 2 = right (push down)
  _updateTangleButton();
}

function _updateTangleButton() {
  const btn = document.getElementById('tangle-btn');
  if (!btn) return;
  btn.textContent = tangling ? `Tangling… (${tangleStepsLeft} left)` : 'Tangle';
  btn.disabled = tangling;
}

// Called once per frame from update(). Advances to the next step when the drag
// target has reached its destination.
function updateTangle() {
  if (!tangling) return;
  if (Math.hypot(tangleDestX - dragTargetX, tangleDestY - dragTargetY) < 1) {
    _nextTangleStep();
  }
}
