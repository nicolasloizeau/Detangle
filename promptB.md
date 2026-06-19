Extend the existing 2D rope simulation (index.html + rope.js). Add proper crossing tracking. Keep everything in the same two files — add a clearly delimited "CROSSINGS" section of small named functions in rope.js. Do NOT change the existing physics, constraints, or drawRope. The only existing thing that changes is drawCrossings (currently an empty stub) and the update/input loops. Keep it short, clean, and well-commented.

Lines may still pass through each other — no repulsion yet. We are only tracking crossings and shading them.

POSITION CONVENTION
Represent a location on the closed loop as a single number p = segmentIndex + param, where segmentIndex is the segment (node i to node i+1, with wrap N-1 -> 0) and param is in [0,1] along it. So p is in [0, N) and is toroidal (mod N). One self-crossing of the loop has two such positions.

SPATIAL GRID (reusable — C will reuse it for repulsion)
- buildGrid(points, cellSize): for each segment (including the wrap segment), add its index to every grid cell its bounding box overlaps. Return a Map from "cx,cy" cell key to an array of segment indices.
- candidatePairs(grid): for each cell, emit every unordered pair of segments sharing that cell; dedupe into a Set of unique (i<j) pairs. This avoids the O(N^2) all-pairs test.
- Use GRID_CELL_SIZE on the order of a few rest lengths.

INTERSECTION
- segmentIntersect(points, i, j): standard 2D segment-segment intersection of segment i and segment j. Return null if they don't cross or are parallel; otherwise return { point:{x,y}, ti, tj } where ti, tj in [0,1].
- Skip any pair that shares a node (j == i, i+1, or i-1, with wrap) — adjacent segments meet at a shared node and are not crossings.
- A raw crossing is { pA: i+ti, pB: j+tj, point }, with no type yet.

PERSISTENCE / MATCHING (this is how type survives as crossings slide)
Each tracked crossing stores: overPos, underPos (two positions in [0,N)), and point. overPos is the strand currently on top.
Each frame:
1. Compute all raw crossings (grid -> candidate pairs -> intersect -> skip adjacent).
2. Match each raw crossing to one crossing from the PREVIOUS frame:
   - Represent each by its sorted pair (lo, hi) = sorted(pos1, pos2).
   - Distance = toroidalDist(lo_a, lo_b) + toroidalDist(hi_a, hi_b), where toroidalDist is the wrap-around distance mod N.
   - Greedy nearest match within MATCH_RADIUS; each previous crossing can be matched at most once.
3. For a MATCHED raw crossing: keep the type. Set overPos = whichever of the raw crossing's two positions is nearer the previous crossing's overPos; underPos = the other. (This carries "who is on top" through the slide = PROPAGATION.)
4. For an UNMATCHED raw crossing: it is newly CREATED. Assign type:
   - speed of a strand at position p = average node speed of segment floor(p), where node speed = distance from its previous to current position.
   - faster = the strand (of the two) with greater speed.
   - if a drag is active with the RIGHT button -> faster strand is OVER.
   - else if a drag is active with the LEFT button -> faster strand is UNDER.
   - else (no drag) -> faster strand is OVER.
   - set overPos / underPos accordingly.
5. Previous crossings that went unmatched are simply dropped = ANNIHILATION (no special rule needed).
Replace the crossing list with this frame's result. No global IDs needed.

Note: two crossings created the same frame (a strand poking through another) share the same faster strand and button, so they naturally get the same type — don't special-case this.

INPUT CHANGES
- Suppress the right-click menu: preventDefault on the "contextmenu" event.
- On mousedown, read e.button (0 = left, 2 = right); store it as the active drag button; grab nearest point within GRAB_RADIUS as before.
- On mouseup, clear the active drag (no button held).
- Both buttons drag identically; the button only affects over/under of crossings created during that drag.

RENDERING — drawCrossings(ctx, points, crossings), pure overlay drawn after drawRope
For each crossing, compute the local tangent of the over-strand and of the under-strand from their current segments (segment floor(pos), direction = next node minus this node, normalized). Then draw two short strokes centered on crossing.point, each of length SHADE_LENGTH, aligned with its strand's tangent, with a linear-gradient alpha that is 0 at both ends and maximal at the center (color stops: transparent, max, transparent):
- Draw the UNDER strand first: a dark stroke (semi-transparent black), normal compositing, max alpha = DARK_STRENGTH. This darkens the rope beneath.
- Then the OVER strand: a light stroke with globalCompositeOperation = "lighter", max alpha = LIGHT_STRENGTH.
Use round line caps and roughly the rope's line width. Reset globalCompositeOperation to "source-over" afterward. No gaps in the rope — the smooth light/dark gradient is the only depth cue.

LOOP / SUBSTEPS
- Add a small SUBSTEPS constant. In update(), run integrate() + solveConstraints() SUBSTEPS times (for stability and to reduce a fast drag tunneling a node fully through a strand), then run crossing detection once.
- render() unchanged in structure: clear, drawRope, drawCrossings.

NEW CONSTANTS at the top, alongside A's:
- SUBSTEPS (e.g. 2)
- GRID_CELL_SIZE (e.g. ~4 * rest length)
- MATCH_RADIUS (e.g. 1.5, in position units)
- SHADE_LENGTH (e.g. ~2 segment lengths in pixels)
- DARK_STRENGTH (e.g. 0.5)
- LIGHT_STRENGTH (e.g. 0.6)

STYLE
Same as before: small single-purpose functions, physics/detection functions read or mutate state, rendering functions only read. Group the new code as a self-contained CROSSINGS section. Keep it readable.
