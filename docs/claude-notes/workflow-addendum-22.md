# Addendum 22 (2026-11-23): hang gliding level of detail

Committed locally on branch `glide-lod` (NOT pushed: `add_repo` with push access was denied this session, repo was cloned read-only). Not yet tested live in the browser.

- New `js/enh/glidelod.js` (v=1, script tag added after smooth.js). While `mode==='glider'` it hides fill-extrusion layers by altitude (`G.alt`, metres): above ~220 m none (clouds, thermals, tower-3d stay); below 220 walls/caps (building-3d, wall-3d, wall-cap, rebuilt-3d); below 110 + roofs, wall-pat, stores-*; below 45 + tree-*, poi-pin, rs-*, snow*. Hysteresis 15%. Steps x0.6 in battery saver (`POWER`), and x0.35..1 adaptive from a smoothed frame time (hide closer to the ground under ~28 fps, grow back slowly when smooth). It only re-shows layers it hid itself; landing restores them.
- `satellite.js` (v=3): `SAT.glide(true/false)`. Forces satellite on for the flight and restores the pre-takeoff choice on landing; never writes localStorage `ydSat`. The ⚙️ Satellite button is ignored during flight (toast).
- `game.js` (v=100): the glide-loop `buildDecor()` call is skipped while trees are hidden (`GLIDELOD.treesOn()`).
- Ideas not done: fade-in instead of pop at tier changes; thinning vector `building-3d` by footprint size at mid altitude; measure with the draw-call counter from addendum 17 before/after.
