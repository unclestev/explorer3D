# Addendum 25 (2026-11-24): Traughber walls on the real footprint, gym doors, doors from paths

Main already has (pushed on "push"): gym doors on every wall with an open stretch (traughber v19, main 43303b8). NOT on main: branch `one-wall` (test branch `claude-test-onewall`, 1f6de04, traughber v20) and branch `door-hints` (= one-wall + door placement, test branch `claude-test-doorhints`, 5132de6, buildings v40). Waiting for the owner's "push".

## Owner report
"Building exterior walls should be drawn right at the edge of the footprint from the mapping data, only ONE exterior wall side. At Traughber there are several exterior walls in different spots with small cavities between them; may also hide windows/doors from outside." Then: "doors and garage doors should be placed where sidewalks and driveway pads lead to the building if identifiable; doors sit in weird spots".

## What was wrong (Traughber)
The school was drawn from the photo-traced plan (rectangles fitted to the real footprint, IoU .65) while the real outline was hidden. Plan edges sat metres off the real edges: gaps, jogs, walls in different places. Window/door slabs stood only 2-9 cm off the wall (depth-buffer flicker from outside).

## Now (js/enh/traughber.js)
- `fit()` turns the plan's axes to the outline's own (within 6 deg, `realign`) and returns `F.real` = the distinct real rings (`distinct()` drops tile-cut copies lying inside a bigger ring).
- `model(F)`: plan rectangles go into the outline's axes, sides snap to outline corners within 1.2 m, space is cut into height cells (default 6.4 m where the plan has nothing), merged, and each cell is clipped to the real ring (Sutherland-Hodgman). So the only outer walls are the footprint's edges; the plan just gives heights. Gym = one block (`M.gym`, gym box clipped to the outline, g:1).
- `details()` runs along the real outline's outer edges (a segment is outer if 0.7 m outside it is not inside any real ring): base, red band, windows, plain doors, entrances (nearest outer wall to the plan's portal spots). Slabs stand 25-50 cm off the wall (`put` scales o1<.5).
- `gymRec(F,M,...)`: gym outline = the clipped polygon (any vertex count); doors/windows only where outside is open air. At Traughber: 5 doors on the 3 exterior sides (the north wall faces the hall wing), 4 windows.
- `T.M` holds the model (debug: `TRJ.state.M`).

## What the data has (checked 2026-11-24)
- Map tiles for Traughber: ONE footprint, render_height 5 for the whole school; no parts, no entrances, no gym marking. POI: school point + parking points.
- Tiles near the school: 1 footway, 1 cycleway, 1 driveway, 1 parking_aisle, some minor/service roads. Whole loaded area: ~30 footways, ~33 driveways (tagged), ~400 untagged `service` ways.
- OpenStreetMap's Overpass could NOT be reached (all mirrors timed out / 502 from the browser pane and sandbox; WebFetch to api.openstreetmap.org needed approval nobody gave). So OSM tags (entrance=*, building:part, height, sports_hall) are untested for Traughber. The game already asks Overpass at run time (parking.js, game.js ovFetch): the same route could fetch entrance nodes and parts.
- Free height source: USGS 3DEP lidar (Overture publishes one lidar height per building, est_height); not used yet.

## Door hints (js/enh/buildings.js v40, branch door-hints)
- `WALKS` = tile lines class path (not cycleway); `DRIVES` now also takes untagged `service` ways of 40 m or less and path/footway/driveway.
- `endSpots(P,edges,toLoc,lines)`: a way's END within 7 m of a wall and heading at it (a sidewalk along the street counts for nothing). Houses: front door where the walk ends (if free of the garage), else the old street-side guess. Stores: wall the path leads to / the wall facing a parking lot (`lotFront`, uses `PARKING.at`), entrance at the path end if inside the glass. Schools: an extra door where each path ends (not the gym).
- Measured live on 62 footway ends heading at a house wall: doors within 1.6 m of the wall point 16 -> 43. Misses are mostly houses that get no doors at all (beyond the facade radius) or garage conflicts.
- Not done: parking-pad polygons for garages; OSM entrance nodes; night / other schools.
