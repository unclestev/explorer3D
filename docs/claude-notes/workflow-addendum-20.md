# Addendum 20 — windows/doors seated in the wall, exit signs (2026-11-23)

Branch `windows-exit-signs` (from `claude-test-interiors` befb9be, i.e. on top of addendum 19), commit 4b9d751, test branch `claude-test-exitsigns`. NOT pushed to main — waiting for the owner's "push". Versions: buildings.js 26, walk.js 28, stores.js 7. Anything the owner changed locally but didn't push was not visible to the session; merge carefully (buildings.js facades(), walk.js buildRoom, stores.js drawDoors).

## Why windows were off the wall (Oswego Meijer)
- `clean()` drops corners turning < ~3.4 degrees, so a long wall's edge drifted up to ~0.8 m off the real wall (tested). Windows/doors/rooms are placed on that outline. facades() now uses `cleanTight()` (drops a corner only if within 4 cm of its neighbours' line, never two in a row).
- A building drawn as several map pieces (Meijer) or with party walls got windows/doors on the walls the pieces share (inside). facades() now builds `nb` (neighbouring parts from `R.parts`) and cuts each edge to the stretches open to the outside (point 0.35 m outside the wall must not lie in a neighbour). Sub-edges carry `ei` (index of the real outline edge) and `off` (start offset); wins/doors/garages record `ei` and `s0+off`, so walk.js rooms still line up. Never use `p.indexOf(E.a)` any more.
- Glass, frames, doors, garage panels, entrance and stores.js's Meijer doors now start 4 cm INSIDE the wall face (offset -0.04) and stand out only 3–8 cm, glass recessed behind the frame. Interior openings already cut through the 0.2 m room wall, so you see out through real thickness.

## Exit signs (walk.js buildRoom, `exitMats`/`exitGlow`)
- One lit EXIT sign on the inside above every `r.doors` entry (not garage doors), centred over the door, at min(door height+0.3, ceiling-0.13). Unlit MeshBasicMaterial + faint additive red halo; not part of ROOM.tro / ROOM.dimM, so the light switches never affect them.
- Checked live on a school (Oswego, East View Academy): sign above the double doors, windows show the outside through the wall.
