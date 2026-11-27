# 3D Driving Game — workflow addendum 9 (2026-11-23, ~1-2 am)

Read after `start-here.md`; newer than addendum 8.

## On local branch `real-traffic` (commits 99e0d70, 844ae60, 3871a8a; also pushed to test branch `claude-test-realtraffic`) — NOT on main until the owner says "push"

### Real-model traffic
Owner asked whether the drivable cars could also appear as traffic; agreed plan, then "build with your suggestions".
- `js/enh/vehicles.js` (?v=20): `REAL` = expedition / modely / javelin3d2 (shares .3/.3/.4), `REAL_SHARE=.25` of traffic cars. `build()` → `buildReal()` builds the similar low-poly design (`lo`: big / luxury / classic) in the same paint, then the .glb (URL from game.js `CARS[key].model`) loads once into a template: meshes baked into the car frame (rotated 180°), merged by surface class (paint, glass, head, tail, shiny, matte; colours as vertex colours) → ~15 draw calls per car. Wheels = nodes `Wheel_*`, merged per wheel, centred for spin/steer. Interiors dropped; glass = shared opaque dark `M.glass`; lamps = shared `M.head`/`M.tail` (traffic.js lights them at night), pushed out 3.5 cm like game.js does (they're built 3.5 cm in).
- Model Y: **white only**, keeps its photo panels (own materials, uv kept, drawn last, envMap like game.js) and uses the model's own paint material — without the envMap the photo doors/back looked grey (owner noticed); without the photos its front/back was a blank blob.
- Expedition: random paints. Javelin: mostly black (3 of 8 slots), some period colours; the gold stripe stays.
- `YD.VEH.detail(g,on)` swaps real model ↔ stand-in.
- `js/enh/traffic.js` (?v=31): `realDetail(near)`: full model only for the nearest `Q3(2,3,4)` visible real cars within 80 m (95 m to switch back).
- Live (githack): models load, an Expedition switched to full detail at ~22 m and back past 95 m; ~0.6 ms more per render with three on (hidden pane, rough).

### Javelin rebuilt (owner's photo of a black 1972 AMX with the gold stripe, 2026-11-23: "flare the wheel wells and make it more resemble this image overall")
- `tools/make-javelin.py` → `models/javelin-amx-v3.glb` (same machinery as make-expedition.py: lofted superellipse sections, `mirror_grid`, patches on front/rear faces, `side_grid` on the real surface incl. flares via `xat`, `top_patch` via `ytop_at`). Size: L 4.872, WB 2.794, track 1.52, tyre R .332.
- Open arches (`RA=.405`), cells below the axle inside the arch are left out (the v2 body ran across the openings — owner saw "lines connecting the bottom of the wheel wells"), liner drum only above the sill; flares = +7.5 cm swell + a crisp lip.
- Gold spear (`Stripe`) under the front fender's shoulder, sweeping down at the door to the rear wheel. No badges/lettering; tyre "letters" are plain blocks.
- game.js (?v=77): the `javelin3d2` choice ("AMC Javelin AMX", the v2 one) now loads v3; the v2 file stays in the repo (v1 `javelin3d` untouched). cockpit.js uses the shared javelin interior by key prefix.
- Renders: harness `/home/claude/h/model.html` + `mshot.py prefix model.glb "yaw=58&d=7.5&h=1.25&ty=.55&fov=34"` (game.js preparation; yaw 58 ≈ the owner's photo angle).

## Session notes
- `add_repo` push was denied at session start, then succeeded later in the session when retried.
- A `python3 -m http.server … &` inside a long Bash command was denied; running the server as its own background Bash command worked.
