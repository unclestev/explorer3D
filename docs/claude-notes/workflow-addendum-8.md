# 3D Driving Game — workflow addendum 8 (2026-11-23, after midnight)

Read after `start-here.md`; newer than addendum 7.

## Pushed to main 2026-11-22 23:26 (3a78bd6)
- Walking into buildings through doors (walk.js ?v=9, buildings.js ?v=9, traffic.js ?v=30). Doors = the front doors / glass entrances buildings.js draws (registry `ROOFS.doorsNear()`: per building {key, id, cx, cy, kx, ky, p (local metres, CCW), doors[], garages[], bb}).
- **Bug in that push:** it hid the building by id → in Yorkville whole neighbourhoods vanished. Fixed on the branch below.

## On branch `claude-test-garage` (NOT on main yet, waiting for "push" as of this note)
Commits d03be0f … 970fce7 on top of 3a78bd6:
- **Garage doors** (new js/enh/garage.js): openers in every car (visor clip-on; Navigator + Expedition = 3 buttons under the rear-view mirror, `hlMirror(P)` = style 'lux' or xp), K key (controls.js action `garage`), 🏠 `#garBtn` in the top bar while in range, phone app "Garage", voice "open/close the garage". Range = driveway (≤12 m out) or inside. Doors roll via map feature state `o` on the `roofs` source (`promoteId:'gk'`, base expression adds o*gr). Car gate: `GARAGE.gate()` called from game.js collision → 'pass' / 'wall' / null. Car in a garage (chase view) = cut-away map layer `interior-3d`.
- **First person indoors on foot** (owner chose it 2026-11-23 over see-through walls): walk.js `fpCam()` puts the map + car-layer cameras at eye height (1.62 m, fov 58, same maths as the cockpit; looking up past the map's 85° slides the map canvas down like the cockpit). The room is built in three.js (`ROOM`: floor, ceiling, full walls with doorway / garage openings + jambs + casing, swinging door leaves, rolling garage panel, ceiling light), placed like a car (offset from S, rotation.y = camera bearing, scale 1/m). The map building stays hidden while inside. Indoors walking is real speed (no SPEEDUP). look.js lets you look up (pitch to 135) when inside. `fpOff()` restores fov 36.87 / near 10 / far 50000.
- **OpenFreeMap shares one feature id across whole groups of buildings** (hundreds, e.g. a subdivision). Never hide or identify a building by id alone. Interior hiding hides the id group and redraws the rest of the group from geometry (`inrest` source, layers `inrest-3d` / `inrest-cap`, like game.js's smash "survivors"); roof/facade features carry `bk` (building key = cx,cy toFixed(6)) instead of the id.
- **boot.js race fixed:** add-ons sometimes never started (map 'load' fired before boot.js ran while map.loaded() was false). Now polls for `styleReady`.
- **F key fixed:** `window.WALK` was reassigned without `toggle`, so F did nothing.
- **Real scale (owner asked 2026-11-23):** EXAG default 1 (was 1.6) — car, traffic, person real size. Chase camera `CAM_IN = log2(1.6)` zoom levels closer at low speed, fading out with speed. On foot always real size (walk.js `WX=1`), walk zoom 21.2. Car-size setting: 100% = real, saved under `ydCarSize2`. Street-name signs stay 1.6x in chase view (legibility; owner relies on them), real size in the cockpit.
- **Next cross street** in the HUD (`#xnext`, game.js `nextCross()`): straight-ahead ray up to 450 m against `roadGeo.names` (now kept to 650 m).

## Testing notes
- Force-pushing `claude-test-teleport` was denied this session; pushed a new branch `claude-test-garage` instead (owner to delete it).
- githack short-sha URLs can fail to load some files (520/504) → always use the full sha.
- `?hour=13` in the URL forces daytime (atmos.js FIX_HOUR), `?wx=` the weather.
- Yorkville houses with garages: around 41.6385, -88.4420 (key "-88.441781,41.638912" has a garage + front door). Mill Street nearby for the next-cross-street line.
- Hidden pane: the game loop may stall or crawl; judge from state, not animation. Split long waits across calls (45 s tool limit).
- Caught twice this session: a `//` comment pasted mid-line swallowed code (walk.js zoom easing). Grep new edits for `// ` followed by more statements.
