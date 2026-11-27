# 3D Driving Game — workflow addendum 10 (2026-11-23, ~1:30 am)

Read after `start-here.md`; newer than addendum 9.

## Smooth road curves (commits 852bef3 + 16e59be on local branch `smooth-roads`, pushed to test branch `claude-test-smooth`; NOT on main until the owner says "push")
Owner: curves showed straight pieces with visible angles. Cause: OpenFreeMap tiles stop at z14, roads are simplified polylines.
- New `js/enh/smooth.js` (?v=1, loaded just before boot.js so its init runs last). Builds a GeoJSON source `roads-smooth` from the vector `transportation` lines per loaded tile: joins pieces of the same road inside the tile (only where exactly 2 ends meet), rounds every inner corner with a quadratic bend (cut ≤ half each neighbouring piece, and ≤ DEV=1.8 m inside the old corner so the drawn road stays where physics/traffic/autopilot think it is — they still use the raw tiles), cuts back to the tile square, then joins pieces cut at tile edges across tiles (so translucent asphalt grain / dashes aren't drawn twice). Parent tiles are dropped where children are loaded.
- Every `transportation` line layer (style roads + our mk-*, tx-asph-*, bridge rails/shadows) is removed and re-added with the same id/paint/position on `roads-smooth`. `roadGeo.src` is pinned to the vector source first. roadside.js `roadLayers()` (?v=5) and satellite.js `beforeId()` (?v=2) also accept `l.source==='roads-smooth'`.
- Rebuild on new tiles (`sourcedata`), at most every 0.8 s, plus a 3 s check; only when the tile set changes. Cost (pane visible): ~195 ms first build, ~45–75 ms when tiles change (≈21 ms of it is setData). `window.SMOOTH` has n / ms / keys / cache. Off switch: localStorage `ydSmooth=0`.
- Checked live on githack: corners >15° within 400 m of the car went 68 → 10 (the rest are 1–2 m steps on driveway hairpins), >45° 21 → 0; 0 unjoined same-road ends at tile seams after a 3 km jump; no new console errors.
