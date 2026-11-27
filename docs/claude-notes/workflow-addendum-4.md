# 3D Driving Game — workflow addendum 4 (2026-11-21 → 11-22)

Read after `start-here.md`; newer than addendum 3. Newest first within each section.

## Owner decisions / preferences
- Turn signals: dash arrow must be off whenever the signal is off. Sounds are synthesized per car (no recordings in the repo); jjcodesnow tuned Explorer/Navigator from videos the owner sent.
- Navigator start-up: owner first said no chime, then accepted a 7 s lower chime with no opening ding and **no starter crank** (PR #14–#16). Explorer start: short crank, hard flare ~1 s, settle; 3 soft three-note dings (PR #17–#19). ⚙️ Start-up sound lets him load his own clip (browser storage only, ≤2.5 MB).
- Explorer cockpit (from his photos): ST wheel, tall portrait 10.1" screen, stalks, overhead console + sunroof (VENT and △ both open it fully), black wipers (longer: driver +25 %, passenger +10 %), G29 R2 toggles wipers.
- **Door mirrors (Explorer):** glass outline traced from his photo in pixels (`mirShapeEx`, points `P` in photo px; outboard end is a "<" point a third of the way down; big round lower-inboard corner); frame slightly slimmer than the first version; housing body shows on the car side; mount flows from the housing to the door behind the glass; **no sail triangles**. Rear-view mirror: glass exactly fills the housing face; **no painted headrests**.
- Compass: in the cockpit only, half size, top left just right of the location panel; chase view keeps it bottom centre.
- Settings are **tabs**: Vehicle · Driving · View · Map · A/V · Places; cars as a vertical list. Driven trail (purple line) **hidden by default** (Map tab switch; still recorded, not redrawn while hidden).
- Displays (cluster, screens, HUD, gear indicator) go dark with the engine off.
- Backup camera on the centre screen in reverse (Explorer/Navigator), parking-sensor beeps (Explorer/Navigator/Model Y) for buildings, traffic, street lights, sign posts, hydrants, mailboxes. Camera stays up after leaving reverse until 5 mph forward or 3 s of forward movement.
- Teleport (⚡ in 🔍 results): address → street in front; town/county/state/country → a random landmark inside (Wikipedia geosearch landmarks first, Overpass fallback; big areas pick a random city/town first). Warp effect holds through the reload (no white screen), dim blue palette.
- Driving side: traffic/autopilot keep left in left-driving countries (from the town lookup's country code); ⚙️ Driving side Auto / Right / Left.
- Xbox/standard controller (no wheel present): left stick steer, RT gas, LT brake-only, Y Drive/Reverse, X engine, LB/RB signals (both = hazards), View = cockpit, D-pad/right stick look. Hides on-screen controls like the wheel.
- Asked about token use: fresh sessions are cheaper for routine PR checks; this file + addendum carry the context.

## Where things live (new since addendum 3)
- `js/enh/signals.js` (PR #7) `window.SIG`; `sync()` recomputes `SIG.left/right` on every change.
- `js/enh/ignition.js` (PR #10) `window.IGN` {state off/crank/on/stop, button(), drive()}; cockpit `powered()` follows it.
- `js/enh/teleport.js` `YD.teleport(p)`; arrival via `START.tp` (game.js reads `ydTp` when `ydStartOnce==='tp'`); savepos.js `snapToRoad` honours `P.back` and retries 30 s for teleports; index.html inline script restyles `#load` during a teleport.
- game.js `driveSide()`, `COUNTRY`, `LEFT_CC`; traffic.js `pos()` and autopilot.js mirror lane offsets by it.
- cockpit.js: `backupCam`, `parkSensors` hook, `rearGap` (bbox-filtered footprints), `BC`; `mirShapeEx(w,h,o,rim,inb)`; stalks lofted along a CatmullRom curve; `compassSpot` sets `--cx`; `rrGeo`.
- traffic.js: `OCC` depth-only building blockers (R 700 m, built in slices by `occJob`, `TRAFFIC.occMesh()`); `hiddenByBuilding` returns false where OCC covers.
- roadside.js `RS.obs`, signs.js `window.SIGN_PTS` (sensor obstacles). towers.js beacons: sight-line walk + flat-map screen check with distance compare.
- wheel.js: Xbox path `readPad`, `isPad`, `findPad`.
- New car: **Ford Expedition** (PR #40, `models/expedition.glb`, built by `tools/make-expedition.py`; cockpit uses the Explorer interior for now).

## Performance notes
- Downtown LA freezes were our JS: street-sign and traffic sight-line checks (~25–30 ms/frame), a one-shot OCC rebuild (~150 ms), and the parking-sensor footprint scan (35 ms). All fixed (see start-here pitfalls). Map still draws every building in view, hidden or not; offered: cap building draw distance in dense cities if he still sees stutter.

## Open / offered, not done
- Issue #2 (button-mapping screen with a G29 picture) — open. Issue #3 (AI cars stopping in intersections) — likely helped by PR #31; owner to confirm before closing.
- Expedition's own interior; an original badge for the Explorer wheel (instead of the declined "Forb" logo).
- Stray branches on GitHub (merged PR branches, `claude-test-teleport`) — only the owner can delete them.
