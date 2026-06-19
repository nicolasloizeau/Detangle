Replace the existing strand repulsion with a single soft, isotropic 3D force between nearby non-adjacent segment pairs. This is the ONLY change. Do not add, remove, or modify anything else in the simulation, and remove any previous repulsion / non-penetration code it supersedes. The force is fully 3D with no preferred axis — x, y, z are treated identically.

THE FORCE
Operate on pairs of segments: segment AB = adjacent points (A, B), segment CD = adjacent points (C, D). A and C may be far apart along the rope. For each qualifying pair:
- e = midpoint of AB = (A + B) / 2   (3D)
- f = midpoint of CD = (C + D) / 2   (3D)
- r = e - f ;  x = |r|   (distance between the midpoints)
- if x is ~0, skip (guard against divide-by-zero); if x > CUTOFF, skip (negligible).
- u = r / x   (unit vector pointing from CD's midpoint toward AB's midpoint)
- m = FORCE_STRENGTH / (1 + exp((x - X0) / SIGMA))
  (logistic falloff: ~FORCE_STRENGTH when x << X0, half at x = X0, ->0 as x grows; X0 is the line's physical thickness, SIGMA the smoothing width)
- add force (+m * u) to BOTH A and B    -> pushes AB away from CD
- add force (-m * u) to BOTH C and D    -> pushes CD away from AB
This is symmetric, so total momentum is conserved.

WHICH PAIRS (avoid the N^2 loop)
- Only nearby pairs matter, since the force vanishes with distance. Reuse the existing spatial grid to get candidate nearby segment pairs; that keeps it ~O(N). Make the grid cell size >= CUTOFF so all pairs within the force's range are captured.
- Skip pairs that share a node: with segment index i = (i, i+1), skip j in {i-1, i, i+1} (with wrap-around on the closed loop). Never let a segment repel itself or its immediate neighbors.
- Dedupe so each unordered pair is processed once.

APPLY AS A FORCE (not a projection)
- Keep a per-node force accumulator (fx, fy, fz); zero it at the start of each substep.
- Accumulate the contributions above over all qualifying pairs.
- Apply the accumulated force as an acceleration in the existing Verlet integration step (x,y,z each), then run the existing constraints as before. The force is soft and continuous — no hard clamping, no position snapping.

CONSTANTS (new)
- X0  (physical line thickness; logistic midpoint)
- SIGMA  (smoothing width of the falloff)
- FORCE_STRENGTH  (overall magnitude)
- CUTOFF  (skip distance, e.g. X0 + 6 * SIGMA)

STYLE: one small repulsion function that fills the force accumulator from the grid's candidate pairs, called once per substep before integration. Keep it readable. Change nothing else.
