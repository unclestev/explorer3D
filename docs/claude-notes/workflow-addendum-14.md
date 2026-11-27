# 3D Driving Game — workflow addendum 14 (2026-11-23, ~7 pm CT)

Read after addendum 13. Local branch `traffic-curves` now holds both the traffic work (7e85b3e, bfdec96) and b2dfcab below; pushed to test branch `claude-test-houses2` (the wip commits are on `claude-test-houses`). NOT on main until the owner says "push".

Owner asked: garage doors lined up with the driveways; more detail on doors and windows; roofs floating above buildings; sharper roofs; roof and siding colours/textures ("all houses are the same color"); parking-lot space lines ("i thought we did this before, but don't see them").

## Why roofs floated (important)
With 3D terrain, MapLibre 3.6 lifts each fill-extrusion feature by the terrain height at that feature's centroid (top = height + centroid elevation; ground-level bases get a 10 m "basement"). OpenFreeMap often makes a whole subdivision ONE building feature (Heartland Dr, Yorkville: one id, 113359010, 1172 polygons), so on a slope its walls were lifted or sunk by metres, while each pitched roof (its own geojson feature) sat on its own house's ground. Up close the walls were mostly sunk and the roofs looked like they floated near the ground.

## Fix: walls redrawn per building (js/enh/buildings.js ?v=14)
- `buildWalls(fs,geo,…)`: every building group with a piece within (roof radius + 60 m) is taken over whole (kept until +150 m away). All its pieces in the loaded tiles go into geojson source `walls`, one feature per polygon, each clipped to its own tile (`clipRing`, Sutherland–Hodgman) so tile duplicates don't overlap. Features carry the map id (so smash / walk filters by id still work), `c` colour, `cc` cap colour, `b`/`h`, and `pat` for houses (not in battery saver). Cached per tile+ring in `W.cache`; setData only when the id set or tile set changes. ~10–20 ms per rebuild.
- Layers: `wall-3d` (filter `!has pat`), `wall-pat` (fill-extrusion-pattern `['get','pat']`), `wall-cap` (h..h+.35, `cc`). All three are in hideIds; wall-3d/wall-pat in blockIds; wall-cap in snowcover ROOFS; wall-pat/wall-3d in towers OCC; cockpit test regex `wall-`.
- **Shared hide filter** (js/game.js): `HIDE={walk,vec}` + `applyHides(lids)`: every hideIds layer leaves out destroyed ∪ HIDE.walk; `building-3d` and `roof-cap` also leave out HIDE.vec (the groups redrawn in walls). destroyBuilding and walk.js hideBuilding now just set state and call applyHides — don't write building filters any other way. buildings.js sets HIDE.vec 350 ms after the walls setData (no blink).
- House looks: `houseLook(seedOf(cx,cy))` → 22 siding colours, 8 brick (20%), 16 roof colours; patterns drawn in code (`wallImages`): `hw-lap<i>` lap siding, `hw-bb<i>` board-and-batten (20% of siding houses), `hw-br<i>` brick. 32 px, pixelRatio 1 (boards read ~20–40 cm at chase zoom ~20). Roof colour per house now too (was per map id → whole subdivision the same). Low non-house buildings get LOWC colours.
- Roofs: nearest houses (Q3 20/35/50, within 130 m) get Q3 14/20/26 slices instead of 5/6/8 (cache key includes the slice count) — fill-extrusions can't slope, this is the "sharper" fix. Complex-outline hip roofs still look terraced.

## Garages at the driveway, more detail
- Driveways = vector `transportation` class service, service=driveway (gathered per build into `DRIVES`). `driveSpot()`: the driveway end nearest a wall (−3..9 m out, along the wall) picks the wall and spot; garage centred there (double door on walls ≥8 m, 60%). No mapped driveway → old guess (street side end). Front door still on the street side.
- Sectional door: 4 panels with joints, raised edges, 35% with a window row; roof-3d paint now base = min(b+o·gr, gt), height = min(h+o·gr, gt) so panels slide up and fold away at the door top (`gt` 2.15, `gr` 1.95). Features without gt are unaffected.
- `fine` houses (the finer-roof tier): trim round the garage, coach lights + porch light (lit after dark), door casing, 4 raised door panels, brass knob, concrete stoop, window muntins and sills, shutters on the street side of 38% of houses, dark trim on 18%.

## Parking lines (js/enh/parking.js ?v=3, textures.js ?v=10)
- Why they didn't show: the lot outlines come from Overpass, and at start-up signs/towers/parking all asked at once; the mirrors refused (and overpass-api.de times out from the owner's side), so `feats` stayed empty (stop signs were also 0). Also the old stripes were a fixed north-aligned pattern.
- `ovFetch` (game.js ?v=94) now queues questions one at a time and retries a mirror once after 4 s on 429/503/504. Live: lots (156), stops (20) and lights (35) all arrived within ~90 s on a fresh origin.
- `stallJob()` generator (≤ ~9 ms per slice, run 6 ms per 100 ms tick): stalls 2.75 × 5.4 m on both sides of every `parking_aisle` (aisle half-width 3.2), and for lots without aisles rows along the long side (stalls / 6.6 m aisle / stalls, back to back). A stall line is kept only inside its lot (when known), outside buildings (25 m grid) and off other roads (20 m grid). Aisles with no known lot get a dark pad (`pk-pads`). Layer `pk-lines`, world-scaled width (~12 cm). Re-run after 300 m, new tiles (≥4 s), or new lots.

## Checked live (githack b2dfcab's parents)
Heartland Dr, Yorkville at ?hour=13&wx=0 (the `hour`/`wx` URL params fix the time/weather): walls full height, varied siding and brick, garages at the driveway ends on every house checked, half-open door shows panels folded at the top; stall lines aligned in the lots by Kendall Marketplace (~41.6558,-88.4397); applyHides filters correct with walk/destroyed; no JS errors.
