# Addendum 29 (2026-11-24): garage bay count, gym night lights, black-houses report

Branches: garage-count (test 0d07ba9, claude-test-gcount2; NOT on main) and gym-night (test 459db99, claude-test-gymnight; NOT on main). Main is 31bfadd.

## Garage bay count from the garage face (buildings.js v53, branch garage-count)
- Owner: "3 car garages are not getting 3 garage doors". Measured round Prairieview Dr, Oswego (87 houses): 200-260 m2 tract houses with 9.4-10.7 m garage wings. The old rule (3.3 m slots, capped by house area A<260 = 2 bays) gave 2.
- Now: a garage that is its own wall face (a wing, or a whole outline edge the driveway reaches, 4.4-14 m) counts bays from the face width: <5.6 m 1, <8.6 m 2, <12.6 m 3, else 4 (nFace). House-size cap only for a face (nArea: A<110 1, <170 2, <260 3, else 4), none for wings. Part of a long wall keeps the old wall/pad/area minimum. Doors centred on the face and filled up to 1.3x. 3 bays: three singles 50%, single+double either order otherwise.
- Result there: 3-car 56 (was ~25): 43 two-door (double+single), 13 three-door; 4-car 8; 2-car 23.
- Open question for the owner: should every 3-car garage show three separate doors?

## Gym night lights (walk.js v47, branch gym-night)
- Owner: "before there were a small set of lights that remained on when both light switches were off" in Traughber. The store troffers keep 1 in 16 on no switch (pts[2]); the gym's UFO high-bays (added 2026-11-24) only had banks 0 and 1, so everything went dark.
- Now: ~1 in 6 gym high-bays (i%6===3, and at least one) are bank 2: own lens/knob/halo material, not touched by lightsApply (loops k in [0,1]). Verified in trj-gym with both switches off: bank 0 (30 lights) and bank 1 (23) dark 0x3b3f47, bank 2 (10 lights) still white.
- Classroom/other school rooms use troffers, which already keep their night lights.

## Black houses / red "MAP: Failed to fetch" banner (not reproduced)
- Owner photo (cockpit view, Prairieview Dr): red banner "MAP: Failed to fetch ... maplibre-gl.js" and all houses black. A page reload fixed both, so the cause was a failed map/network fetch (likely a sleep/network drop) leaving the wall textures (hw-/cw- images added once in wallImages()) missing, not the new code. Removing all 79 hw-/cw- images in the page reproduces black/dark-textured houses (the symptom), and nothing re-adds them. Possible hardening: re-add wall images on the map 'styleimagemissing' event or after a WebGL context restore; the error banner (js/game.js map.on('error')) never clears.
