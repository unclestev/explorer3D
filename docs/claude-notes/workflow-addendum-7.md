# 3D Driving Game — workflow addendum 7 (2026-11-22, late night)

Read after `start-here.md`; newer than addendum 6.

## Expedition cockpit rework (pushed 2026-11-22 ~22:55 as 5fabe31, merged with #57 Phone; cockpit.js ?v=97; Pages deploy succeeded)
Owner compared the cockpit to a photo of the 2025 Expedition dash. Changes (all in `js/enh/cockpit.js`):
- `SPECS.expedition.wheel.c` y 1.105 → 1.165 (wheel 6 cm higher; from the eye its rim now crosses the left centre vent, as owner expected).
- `screen` → `{c:[.06,1.172,-.646],w:.33,h:.188,tilt:10}` (bigger, brought forward). The two centre vents are now at the screen's own depth and tilt, height S.h-.004, so the screen is centred between them from the driver's offset eye (before, parallax made it look off-centre).
- Outboard vents (xp) turned in ~22° (`ey=.38`) toward driver / passenger.
- `expeditionDash`: controls sit on a **shelf** under the screen (group `g`, top sloping 10° toward the driver, dial standing up). The satin band runs under screen/vents and wraps the shelf's front lip. `parts.shelf={ys,zsF}` is passed to `consoleXp`. Hood over the column behind the wheel with a driver-camera pod. Start button moved up beside the left centre vent.
- `consoleXp(G,P,T,loM,sh)`: tall bridge console starting right under the shelf lip, satin rails, tray + cup holders, open pass-through in the front face, then one wide padded armrest shared by both front seats.
- `doorXp` (new): driver's door switch panel on the armrest (windows ×4, window lock, lock/unlock, mirror pad + L/R), seat-memory SET 1 2 3, chrome release handle. **Decorative only** — not wired to anything.
- Grab handle on each A-pillar (xp only), in the pillar material, chunky.
- **All cars:** A-pillars use their own material with `transparent:true` and `renderOrder 7`, so they draw after the windshield glass and the frit dots never show on them; the frit's side bands start where the pillar trim ends (`so` offset from pillar width). Checked Explorer / Navigator / Model Y / Javelin renders.

## Harness rebuilt
- `/home/claude/h`: `page.html` + `shot.py` (playwright, swiftshader). three.js r128 isn't reachable from the shell's CDN hosts; got it via `git clone --depth 1 --branch r128 --filter=blob:none --sparse https://github.com/mrdoob/three.js` + `sparse-checkout set build`.
- `ck.js` = cockpit.js with the last `})();` replaced to export `window.__ck={build,SPECS,update}`; page params `car, pitch, yaw, fov, dx, dy, dz, hemi`. `update()` throws in the harness (steerLock missing) so screens/PRND render blank — fine for geometry. Lighting is flatter/brighter than the game.

## Session notes
- `add_repo` push was denied at session start again and succeeded when retried after the owner said "push" (same as addendum 6).
- Owner reviews each tweak from render images; send the before/after PNGs with SendUserFile.
