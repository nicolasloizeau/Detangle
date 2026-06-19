Build a minimal 2D "string on a table" simulation in vanilla JavaScript — no libraries, no frameworks, no build step. Exactly two files: index.html and rope.js. The code must be short, clean, and split into small named functions with brief comments. Aim for a couple hundred readable lines total. No UI chrome, no buttons, no on-screen text, no extra features.

NO self-collision in this version: the string may pass through itself freely. But structure the code so crossing logic can be added later as a separate geometry pass and rendering overlay (see Rendering).

THE OBJECT
A closed loop of string lying flat on a top-down table. No gravity, in-plane motion only. Heavily damped (overdamped) so it settles and holds its shape when released. The player drags points with the mouse.

PHYSICS — Verlet integration with position-based constraints
- Represent the string as an ordered array of points, each { x, y, px, py } (current and previous position). It is a CLOSED LOOP: the last point connects back to the first.
- Initialize as a circle centered on the canvas. Set each point's previous position equal to its current position (zero initial velocity). Compute a single segment rest length from the initial distance between adjacent points, so the circle starts in equilibrium.
- Each frame, run one update:
  1. Integrate (Verlet): for each point, vx = (x - px) * DAMPING, vy = (y - py) * DAMPING; then set px = x, py = y; then x += vx, y += vy. No gravity, no other forces.
  2. Solve constraints CONSTRAINT_ITERATIONS times. In each iteration, in order:
     - Distance constraints between every adjacent pair, INCLUDING last→first, restoring segment length = restLength.
     - Bending constraints between every point i and point i+2 (with wrap-around), using their initial rest distance, applied weakly with strength BEND_STIFFNESS so the loop resists sharp kinks but stays flexible.
     - If a point is being dragged, re-pin it to the current mouse position at the end of each iteration so constraints never pull it off the cursor.
- Distance constraint helper: move the two points along their connecting line to restore the target length. Support "movable" flags so a pinned point is never displaced and the other point takes the full correction.

INTERACTION
- On mousedown: find the nearest point within GRAB_RADIUS. If found, mark it as the dragged point; if none, do nothing.
- While dragging: the dragged point follows the mouse and is treated as immovable in constraints. Neighbors follow naturally through the constraints.
- On mouseup: clear the dragged point. Damping brings the string to rest on its own.

RENDERING — two separate functions, called in this order every frame
- drawRope(ctx, points): draw the closed polyline through all points (path back to the first point), with round line joins and caps, LINE_WIDTH thickness, a single color.
- drawCrossings(ctx, points): leave this EMPTY for now — just a stub with a comment. Later it will overlay crossing markers on top of the rope. Call it every frame, after drawRope.

MAIN LOOP
requestAnimationFrame. Each frame: update(), then render(). render() clears the canvas, then calls drawRope, then drawCrossings. Canvas fills the window and resizes with it.

CONSTANTS — expose all tunables as named constants at the top of rope.js:
- N_POINTS (e.g. 120)
- CIRCLE_RADIUS (e.g. a fraction of the smaller window dimension)
- CONSTRAINT_ITERATIONS (e.g. 30)
- DAMPING (e.g. 0.8 — lower means more friction / faster settling)
- BEND_STIFFNESS (0..1, e.g. 0.1)
- GRAB_RADIUS (e.g. 30 pixels)
- LINE_WIDTH (e.g. 8)
- colors (background, rope)

STYLE
ES6, vanilla. Keep functions small and single-purpose. Physics functions read/mutate the points array; rendering functions only read it. Group the file clearly into: constants, setup (circle creation), physics (integrate + constraints + helper), input handling, rendering, main loop.
