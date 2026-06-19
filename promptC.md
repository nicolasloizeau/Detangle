Reframe the rope as a quasi-3D simulation. Each node gains a height z; the rope wants to lie flat (z=0), strands repel in full 3D, and a crossing is simply one strand locally lifted above another. Hooks locking and same-type pokes staying free now emerge from 3D repulsion at any line thickness, with no hook/crossing-type detection needed for the physics. Extend the same two files, keep functions small, reuse the existing grid and crossing detection.

STATE
Each point becomes { x, y, z, px, py, pz }. Initialize z = pz = 0 (a flat circle).

UNCHANGED
Keep A's xy distance and bending constraints exactly as they are (the rope stays inextensible and smooth in the plane). z is governed by its own independently tunable dynamics below.

Z DYNAMICS (act on z only, each solver iteration)
- Ground (z^2 potential): pull each node's z toward 0 -> z -= Z_GROUND * z.
- Z stiffness (independent out-of-plane stiffness): Laplacian smoothing -> move each z a fraction Z_STIFFNESS toward the average of its two neighbors' z. Higher = stiffer ribbon, broader lifts. Tuned separately from xy.
- Z friction: damp z velocity by Z_DAMPING in the Verlet step (may differ from xy DAMPING).

3D REPULSION (non-penetration; reuse the grid)
- Build the grid in xy as before. For each node P, test against nearby NON-adjacent segments S (skip P's own neighbor segments).
- Compute the 3D point-to-segment distance from P to S (in x,y,z). If < THICKNESS, push P and S's two nodes apart along the 3D closest-approach direction until the distance equals THICKNESS. Split the correction by S's foot parameter (barycentric) and preserve the center of mass (equal masses: P takes half, S shares half).
- No special cases. Where strands are already stacked (|dz| >= THICKNESS) the 3D distance is already >= THICKNESS so nothing happens (normal crossings are left alone). Where strands meet at equal height the closest approach is horizontal, so they separate in xy (side contacts and hook bends lock). Where stacked the closest approach is vertical, so they separate in z (crossings hold against the ground pull).
- THICKNESS is the collision diameter; tie it to LINE_WIDTH.

CROSSING CREATION (the only deliberate z-set)
- Keep B's per-frame xy self-intersection detection. When a crossing is NEWLY created this frame:
  - find the faster-moving of its two strands (as in B);
  - right button -> faster strand goes OVER; left button -> UNDER; no button -> faster strand OVER;
  - set the over strand's two crossing nodes' z to (under strand's z at the crossing) + THICKNESS + Z_MARGIN, and set their pz equal to z (no spurious z-velocity). Leave the under strand where it is.
- After this one set, repulsion + ground + stiffness maintain everything; z is never scripted again.

OVER/UNDER IS READ FROM z (not stored)
- The over/under of a crossing = sign of the height difference between its two strands (higher z is over). B's cross-frame type-matching is now redundant and can be removed; keep only the xy-intersection detection (to locate crossings for shading and to fire the creation event above).

RENDERING (drawCrossings, same overlay role, after drawRope)
- For each crossing the over strand is the higher-z one. Draw the same soft light/dark shading as in B (over lightened, under darkened, gradient peaking at the crossing) using that. Cores no longer overlap, since repulsion holds strands THICKNESS apart.
- Optional: tint the whole rope slightly by z so height reads even between crossings.

LOOP ORDER per substep: integrate (x,y,z with damping / Z_DAMPING) -> xy constraints -> z dynamics (ground, stiffness) -> 3D repulsion. Once per frame: detect crossings (xy), apply creation z-sets to new ones, render.

NEW CONSTANTS
- THICKNESS (= LINE_WIDTH)
- Z_GROUND (restoring toward 0, e.g. 0.05)
- Z_STIFFNESS (out-of-plane smoothing 0..1, e.g. 0.2, independent of xy)
- Z_DAMPING (z friction, e.g. ~DAMPING)
- Z_MARGIN (extra clearance at creation, small fraction of THICKNESS)
- (Repulsion as a hard projection to THICKNESS; or expose REPULSION_ITERATIONS.)

STYLE: small functions, z-handling in its own section, repulsion reusing the existing grid. Keep it readable.
