# Addendum 19 — interior textures, windows from inside, light switches everywhere, school fix, signs off buildings (2026-11-23)

Branch `interiors` (test branch `claude-test-interiors`, last befb9be), main 75223ad (jjcodesnow's Meijer switches/troffer look, PRs #83–#92) merged in. NOT pushed to main — waiting for the owner's "push". Versions: game.js 98, signs.js 19, walk.js 27, buildings.js 25, cockpit.js 110, voice.js 24.

## Interiors (js/enh/walk.js, "what the rooms look like")
- Nothing exists until you walk in: `buildRoom` -> `roomLook(r,SH)`; textures painted lazily (13 shared 256 px canvases max), room meshes dropped on leaving. Seeded by `r.key` (`seedOf`, `prng`), never Math.random: same building, same look (400-building offline test: 0 mismatches).
- Kinds (`roomKind`): house, shop, school (`r.zone`), office (>12 m), industrial, store (Meijer keeps its own `storeMat` look and its walls are never cut for windows). `buildings.js` puts `zone`, `area` and `win` on the door record `res.bld`.
- Walls carry UVs in metres (`wq()`); all textures power-of-two. Materials: color*0.7 + emissive .22 (floors .18) with emissiveMap (first try .42 blew out to white).
- Every non-house gets the Meijer troffers.

## Windows from inside
- `facades()` records every window (`wins`: edge index, s0, s1, b, h; also the storefront glass band) in `res.bld.win`. `buildRoom`'s `solid()` cuts those openings in the room walls (casing + sill trim). The map building is hidden while you're in, so the real outside shows through — nothing was unloaded, so nothing needs reloading. Not done: inside the room from outside (owner doesn't want it), glass panes.

## Light switches in every building
- jjcodesnow's switch code (`switches`, `lightsApply`, `flipLights`) now runs for every room: non-houses two switches (troffer rows), houses one switch for the ceiling globe (`switches(g,r,HC,1)`). Switch positions are remembered per building (`LSWS`, keyed by `r.key`). Walls/floor/ceiling of textured rooms dim with the lights (`ROOM.dimM`).
- Voice (voice.js): inside any building on foot, "lights on/off", "switch one/two" go to the room (`WALK.inStore()` now means "has switches"); "headlights ..." still goes to the car.

## Schools
- Cause of no windows/lights: `facades()` skipped any outline with >80 corners (Oswego High's is ~90). Limit now 400; outlines with >90 long-enough edges keep only walls >= 8 m.
- Oswego High School (`SCHCOL` in buildings.js, matched by school map-point name within 300 m of the building): up-light slices orange (#ff8a1a..#c24d00), down-light slices navy-blue (#3b63ff..#1a3290). Other schools stay warm. The glow points in the car layer are still warm white.

## Signs and objects (js/game.js `bldClear`, `offBuilding`, `placeClear`; cockpit.js `blocksNear`)
- Stop signs, signals, crossbucks and street-name blades go through `placeClear` (alternates `offRoad`/`offBuilding`, 1.5 m off walls; tries 4 spots 5 m around, else no sign). Trees and roadside objects already checked footprints. Verified on a point in a shop; signs data (Overpass) never arrived in test, so not seen end to end.
