# Addendum 18 — porch lights, garage side lights, school and commercial accent lights (2026-11-23)

Owner asked: (1) porch lights on houses, matching lights on each side of the garage door, on after dark for ~90% of houses; (2) accent lights on commercial buildings and schools — schools: lights shining above and below the fixture between every window; commercial and schools: all lit at night. Branch `porch-lights` (test branch `claude-test-porch`, last 5c4da4d), based on main ae4d751 (snowmen merged) **with `grass-siding` (addendum 17) already merged in** (needed for `zoneAt` school detection) — so one push of `porch-lights` brings both. js/enh/buildings.js is ?v=19 in index.html.

## Houses
- buildings.js `facades()` house branch: `lamp(E,s,z,o,r)` draws a carriage lantern (wall plate, bottom, frosted glass `LGL`, corner posts on the nearest houses, roof, finial). One fixture colour per house (`LAMP`, hash 93) so porch and garage lights match. Porch light at door s+.9 (door's occupy widened to s+1.15); garage lights at s0-.42 and s0+gw+.42, z 1.95. Drawn for all houses unless battery saver.
- On/off: `hash(seed,97)<.9` → glass gets `lit:2`; measured 138 of 150 houses lit near Liberty St. `paintRoofs` night colour is a `match` on lit (1 windows #ffd27f, 2 lanterns #fff4cf).

## Schools and commercial (all lit, no 10% off)
- `facades()` now computes `zone=zoneAt(...)` for non-houses (school / industrial / null) and has helpers after `edges`: `accent(E,s,z,{up,dn,sh,bw,bh,ws,pool,po})` (dark body, warm lens on the lit side, wash slices, glow point), `gooseneck(E,s,zt)`, `wash()`, `gpt()`.
- **Schools** (branch before the storefront one): a window on every floor of every wall (~3.4 m pitch, 1.8 m wide), an up-and-down accent (`up:sl,dn:sl`, 3 slices on the nearest buildings, else 2) at each gap between windows, glass entrance mid street side with a downlight each side. Replaces the old school-as-storefront look. Small buildings inside school grounds still count as houses by size.
- **Shops** (≤12 m, not school): goosenecks over the sign band every ~4–6 m (not industrial), wall packs (`dn:2`, ground pool r 5.5) at the street-side corners and on the middle (and quarter points of long) side walls.
- **Towers** (>12 m): uplights along the front wall base (up to 12, 4 slices of .55 m), downlights each side of the lobby.
- Wash slices live in their own source/layer `accent-wash` (fill-extrusion, opacity .85, o .012–.03 m off the wall), visible only at night and not in battery saver — by day nothing shows (checked at hour=13). `C.wash` / `C.glow` are cached per building with the facade set (cleared by the facade cache, like walls).
- School zones come from landuse polygons or a school POI near a >500 m² building; a facade cached before the tiles had loaded keeps its first guess.

## Glow in the car layer (why)
- The map shades fill-extrusions by its night light (#a9b8ff at 0.25): nothing drawn as a map shape looks bright (the "glowing" windows are also dull). So each lit fixture also gets a point in one `THREE.Points` (additive, radial texture, ~1 m) in the car-layer `scene`, placed like traffic.js OCC (metres from origin `LG.o`, moved by camB each frame in FRAME_HOOK `lampGlow`). OCC blockers hide the ones behind buildings (only while traffic is on). PointsMaterial sizes by half the screen height, so size = metres/m/tan(fov/2).
- Ground pools: circle layer `porch-glow` (filter r>0; r = metres / cos(lat), zoom-exponential radius), before wall-3d; night and not battery saver.
- Gotchas: `WALK.inside` is always an object — test `WALK.inside.rec`. In the hidden pane the map canvas can come up 400×300 — `dispatchEvent(new Event('resize')); map.resize()` before screenshots.
- Not done: the ordinary windows' night glow is still dull (same cause); could get glow points too.
