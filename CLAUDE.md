# CLAUDE.md — Yorkville Driver (unclestev/explorer3D)

Read this first in every session. It replaces the claude.ai project notes (`start-here.md` + 30 workflow addenda), which are archived word for word in `docs/claude-notes/` for the full history and the deep detail behind each decision. **Where this file and an archived note disagree, this file wins; where two archived notes disagree, the newer one wins.**

Keep this file current: when a decision, setting or convention changes, edit it here (and add a dated line to "Change log" at the bottom). Don't start new addenda.

---

## 1. What the project is

- **Yorkville Driver**: a browser 3D driving game that drives over a **real, live map** (OpenFreeMap vector tiles, OpenStreetMap data), centred on the owner's home area (Yorkville / Oswego / Sugar Grove / Aurora, Illinois) but meant to work anywhere on Earth.
- Plain static site: `index.html` + `css/` + `js/` + `models/` + `img/`. **No build step, no bundler, no npm dependencies.** MapLibre GL **3.6.2** and three.js **r128** come from CDNs (jsdelivr → cdnjs → unpkg fallbacks in index.html); `js/lib/GLTFLoader.js` is vendored.
- Live on **GitHub Pages**: https://unclestev.github.io/explorer3D/ — updates ~1 minute after a push to `main`. Installed as a home-screen PWA on the owner's phone; `js/update.js` pulls new versions without a reinstall.
- People:
  - **unclestev** — owner. Plays on a **PC with a Logitech G29 wheel + Driving Force shifter** (and an Xbox controller), and on an **iPhone**. The G29 is not connected to every PC he uses — ask before planning a live wheel test. His own car: **2023 Tesla Model Y Long Range AWD, Acceleration Boost, white, 20" black wheels**.
  - **jjcodesnow** — collaborator with write access; sends pull requests (often written by his own Claude sessions).
  - The main player prefers **free driving without gaming features** (see §3).
- Free data services used at run time (all keyless): OpenFreeMap tiles (`tiles.openfreemap.org/styles/liberty`), Overpass (`overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee`), OSRM routing (`router.project-osrm.org`), Open-Meteo weather, Esri World Imagery (satellite), Wikipedia geosearch (teleport), Radio Browser (live radio), Apple iTunes Search (30-second song previews), YouTube embedded player. Any new data source must carry its `attribution` (shown behind the ⓘ button).

## 2. Hard rules (the owner set these — follow exactly)

### Git and GitHub
- **Push to `main` only when the owner says "push" or "merge" in that message.** Otherwise commit locally (or on a feature branch) and tell him it's ready. Before pushing: `git fetch`, merge `origin/main` (PRs often land in the meantime), `node --check` every changed file, bump `?v=` numbers, then push.
- Commit as the owner: `git config user.name "unclestev"`, `git config user.email "334307252+unclestev@users.noreply.github.com"`; Claude goes in as `Co-Authored-By:` (plus any session-attribution line the environment asks for). Don't rewrite history.
- **Never approve PRs, comment, open issues or post anything on GitHub without asking** — it posts from the owner's account.
- **Pull requests** — when asked "did jjcodesnow make a pull request" / "check PRs": list them (`gh api repos/unclestev/explorer3D/pulls?state=all`), review the diff, `node --check` every changed `.js`, check it merges with `main` and with any unpushed local work, render/test it where it's visual, then summarise in plain words with caveats and end with **"Tell me to merge it."** Merge only on his say (`gh api -X PUT repos/unclestev/explorer3D/pulls/N/merge -f merge_method=merge`), then **wait for the Pages deploy and say when it's live** (poll `gh api repos/unclestev/explorer3D/actions/runs?per_page=3` until the merge commit is `completed` / `success`).
- If a PR and unpushed local work both bump the same `?v=`, merge locally, set the number past both, push once (GitHub then marks the PR merged).
- Test builds go on throwaway branches named `claude-test-<thing>` (never force-push `main`). Only the owner can delete branches/change repo settings.
- `docs/claude-notes/review-workflow-plan.md` is a parked plan (CODEOWNERS + rulesets + Claude-reviews-PRs). **Don't set it up unless asked.**

### Code conventions
- **Bump the `?v=N` on every changed JS/CSS file's tag in `index.html`** — phones and browsers cache, and `update.js` detects new versions by these numbers. `engine-worklet.js` is versioned by the `?v=` inside sound.js's `addModule` call; car models by the `?v=` in `CARS[key].model` in game.js. `bash tools/check.sh` verifies this against `origin/main`.
- **Every key / button goes through `js/enh/controls.js`** (`window.CTRL`: an action + default bindings for keyboard, wheel and pad). Never add a new `addEventListener('keydown')` — the Controls screen must always show the truth.
- **Make controls touch-capable whenever possible** when building features (on-screen button for phones).
- **Never put a `//` comment in the middle of a one-line statement list.** Much of the code is dense one-liners; a `//` silently comments out the rest of the line (it has broken `camera.setViewOffset`, two files' syntax, and traughber.js's one-line `window.TRJ={…}`). Use `/* */`. After an edit, grep for `// ` followed by more statements.
- New feature = a new module in `js/enh/`, an IIFE wrapped so a failure can't stop the game, registered with `YD.onReady` / `YD.onTick`, script tag **before `boot.js`** (boot.js loads last; core.js first). Anything that moves every frame in the car layer is a function pushed onto `FRAME_HOOKS` that returns true when it moved something. Anything that must progress while parked (sliced jobs, timers) belongs in a frame hook or timer, not in `COCKPIT.render`/`update()` (those only run when the game redraws).
- Heavy work is **sliced over frames** (generators like traffic.js `OCC.job`, parking.js `stallJob`), never done in one go. Map-data rebuilds skip `setData` when nothing changed (battery).
- React to graphics level changes by **wrapping** `window.onPowerChange` / `window.onModeChange` / `window.onCarChange` (chain, don't overwrite).
- Read `SPEEDUP` live (it changes between 3 and 1); never cache it at load.
- Deterministic looks: anything per-building/per-house is **seeded** from the building (`seedOf`, `hash`, `prng`), never `Math.random`, so the same house always looks the same.
- **Global map data over local data**: features should work anywhere OpenFreeMap/OpenMapTiles covers (owner preference). Yorkville-specific data (Traughber, the water towers, Oswego High colours) is the exception, not the pattern. Zoning/parcel layers are deliberately not used.
- **Consistency of repeated parts**: repeated parts of one object match (all garage doors on one garage share colour, panel style and window row; porch and garage lamps on one house match). Pay attention to this in every design.
- **No real brand logos, badges, lettering or look-alikes.** Declined a "Forb" Ford-style logo; offered an original badge instead. Car models are original builds or files the owner supplies; traffic designs are original (generic "luxury SUV", "full-size SUV", etc.). Interiors are originals "in the spirit" of the class/era — the Explorer ST interior must not be moved closer to Ford's real layout. Player cars may be built from the owner's **own** photos.
- Don't add security exposure: explain risks in plain words before adding any sign-in, API key or third-party account. Never use unofficial cookie-based libraries (e.g. YouTube Music scrapers).

## 3. Product decisions (what the owner wants, and why)

**Play style**
- **Open world / free drive is the game.** Anything that changes how it plays (time trials, challenges, police) must be switched on deliberately — never automatically. Background stats are fine as long as they only observe. No scores, fail states or penalties in free drive. Improve the *feel* instead.
- Navigation is in-game only (from the car's game position to a 🔍 search result). **No real GPS / location permission** — real-location features are on hold (privacy, battery, safety). Destinations come only from 🔍 search (tap-to-drop-pin was removed on request). The owner calls 🔍 "the GPS".
- Hang glider only via 🪂 (or G); get out and walk only via 🚶 (or F). Never automatic.
- The game reopens where you left off (`ydPos`); ⚙️ Start at → Random place is an option.
- Arcade plan (agreed 2026-11-12, not started): the game may later move under `unclestev/arcade` as a cabinet that opens straight into free drive, with one optional scored board. How scored runs get verified is **not decided**. Don't build without asking.

**Look and realism**
- Real scale (`EXAG` 1): car, traffic and person at real size. Street-name signs stay 1.6× in chase view for legibility (he relies on them), real size in the cockpit. Street-name blades behave like real ones (each blade parallel to the street it names).
- World speed: `SPEEDUP` = 3 in chase view (world moves 3× the speedometer), 1 in the cockpit with ⚙️ Real speed on (default on).
- ⚙️ Realistic driving (default **on**, owner asked): per-car 0–60/top speed (Explorer 5.2 s / 143 mph; Javelin 6.8 s / 120 mph and reachable from half pedal; Navigator 6.1 s / 115), wet/snow/ice grip, per-surface grip/drag/top speed/bumps, solid buildings/trees/traffic. Off = the old arcade formula exactly.
- Trees follow the seasons (autumn Oct 1–Nov 10, bare Nov 11–Mar 31, conifers green). Trees and signs never stand in buildings or on streets.
- Weather tracks the real weather at the car's position (Open-Meteo) — he checks it against reality.
- Satellite imagery off by default. Driven trail (purple line) hidden by default. Map credits behind the small ⓘ (MapLibre's attribution bar is off on purpose). Road-name labels hidden in all views (performance; `ydRoadLabels=1` brings them back). Compass replaced the minimap — don't bring back a second map without asking.
- Water towers in Oswego, Yorkville and Sugar Grove look like the real ones (owner's photos; town decided from real town limits); flashing beacon white by day, red at night. The Yorkville fox head was hand-drawn from his close-up photo — tweak `drawFox` in towers.js, don't re-trace pixels.
- Night: porch lights + matching garage side lights on ~90% of houses; schools and commercial buildings all lit; bright lights live in the three.js car layer (see §6).
- Indoors on foot is **first person** (owner chose it over see-through walls). He doesn't want to see room interiors from outside.
- Displays (cluster, screens, HUD) go dark with the engine off; wipers park when the engine is off; music stops with the engine and resumes on the same station when it starts.
- When matching something to his photos: trace shapes from the photo and compare side by side. He notices seams, notches, gaps, asymmetry and boxiness. Send before/after renders.

**Cars** (⚙️ Car; key in `CARS` in game.js)
- Ford Explorer ST (default, photo body + front photo), Lincoln Navigator (photo), Ford Expedition 2025 (`models/expedition.glb`, own cockpit), AMC Javelin AMX (`javelin3d2` → `models/javelin-amx-v3.glb`, the only Javelin kept), 70's Muscle Car (`muscle70`, frozen earlier Javelin rebuild), Tesla Model Y (`models/model-y.glb`, white only, built from his photos), tractor (John Deere-style, a car choice), snow plow, 🚤 boat (only when picked while in water). No automatic vehicle switching.
- Model generators live in `tools/make-*.py` (numpy/scipy, `tools/glbtool.py`). After changing a script, regenerate the `.glb` and bump its `?v=` in `CARS`.
- Traffic uses original low-poly designs plus the real models (Expedition / Model Y / Javelin / muscle car) at full detail only for the nearest few cars.
- Engine sounds are **synthesized** (no recordings): AMC 401 V8, 3.0 EcoBoost V6, 3.5 EcoBoost V6, JD PowerTech 6.8 diesel, Model Y motor whine. Keep new engines deep, not "chain saw" — check the phone-band level offline.

**Music / media decisions**
- Apple 30-second previews (explicit songs excluded) + 📁 own files + live radio (Radio Browser, presets, seeded with 93.9 LITE FM Chicago) + YouTube links on the centre screen via the official embed (pauses while moving). Full-song YouTube search would need a YouTube Data API key from the owner, restricted to the game's address — not built. Spotify Web Playback was considered and not chosen.

**Graphics direction (2026-11-25, open)**
- Owner wants to enhance graphics "quite a bit". Roadmap (whiteboard https://claude.ai/artifact/HguUw74PvxY81LL7WyVz1y): **0** benchmark → **1** restructure (Vite build, ES modules, tests) + upgrade MapLibre 3.6 → 5 and three.js r128 → current → **2** move the near world (~300 m: buildings, roads, lots, ground) from MapLibre into three.js, trial one street first → **3** what that unlocks (shadows, real night light, reflections, weather, seamless interiors). Skip Google photoreal tiles and native engines unless web/phone stop mattering.
- Open questions: which machines to benchmark (an old gaming PC ran terrain smoothly); whether the phone must keep every new visual (working guess: PC gets extras, phone stays smooth).
- Don't start steps 1–3 without the owner's go-ahead. A MapLibre upgrade must recheck everything that touches MapLibre internals (§6).

## 4. Running and testing

### Run it locally (new with Claude Code)
```
python3 -m http.server 8000      # from the repo root
# open http://localhost:8000/            (separate origin = separate localStorage; Overpass data takes 1–2 min to arrive the first time)
```
Useful URL switches: `?hour=13&wx=0` (fixed daylight, clear), `?hour=22&wx=0` (night), `?wx=63|73|45|95|66` (rain / snow / fog / storm / freezing rain — WMO codes), `?temp=NN` (°F, e.g. ice), `?fps=1` (frame meter), `?hide=buildings,roofs,trees,roadside,roads,water,landuse,signs,traffic` (cost testing), `?car=3d`, `?bench=1` (benchmark here; benchmark branch only). localStorage `ydSmooth=0` turns smooth roads off; `ydRoadLabels=1` shows road labels.

Start somewhere specific: set localStorage `ydTp` = `{"name":"…","lat":…,"lng":…}` and `ydStartOnce` = `tp`, reload.

### Checks before any commit
- `bash tools/check.sh` — `node --check` on every JS file + checks that every JS/CSS file changed vs `origin/main` has a bumped `?v=` in index.html.
- Physics/feel changes: simulate at realistic pedal values (a thumb press is ~0.5–0.7 gas), not only full pedal.

### Driving the live game from a browser tool
Globals: `S` (state: `S.lat/S.lng`, speed `S.v`, heading `S.hdg` in degrees, chase zoom `S.zoom`), `map`, `scene`, `COCKPIT`, `TRAFFIC`, `FRAME_HOOKS`, `YD`, `SIG`, `IGN`, `WHEEL`, `CTRL`, `CTRLVIEW`, `SMOOTH`, `ROOFS`, `PARKING`, `HIDE`, `SNOWCOVER`, `SNOWMEN`, `TRJ`, `WALK`, `RINK`, `ICE`, `GARAGE`, `MUSIC`, `SOUND`, `QUAL`.
- Keys: `dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w'}))` — controls.js reads `code`.
- On foot: `WALK.toggle()`; to enter a building stand ~1 m outside a door from `ROOFS.doorsNear()` (`rec.doors`) and hold W. Inside = `WALK.inside.rec` (`WALK.inside` is always an object).
- Face a building: entries from `ROOFS.doorsNear()` carry local x/y and wall normal nx/ny: `S.lng=b.cx+x/b.kx`, `S.lat=b.cy+y/b.ky`, `S.hdg=atan2(-nx,-ny)` in degrees. If `S` is inside a footprint the game hides that building's walls — stand on the street.
- Snow: `SNOWCOVER.set(1,8)` (melts while not snowing — re-set on an interval), `SNOWMEN.force(true)`. Rinks: `RINK.forceHere()`.
- Hidden/throttled browser panes: timings are garbage (judge from state, not fps); the map canvas can come up 400×300 — `dispatchEvent(new Event('resize')); map.resize()`. Long awaits time out — poll in separate calls. With terrain on, `queryRenderedFeatures` at a point returns nothing: use `map.unproject` + point-in-polygon on `querySourceFeatures`. MapLibre layer errors show as a red box in the game and are **not** thrown to your code — look at a screenshot.
- Measuring cost: wrap `map.painter.renderLayer` (per-layer ms) and the map's `gl.drawElements` (draw calls/triangles); three.js `renderer.info`. Measure per-call costs by wrapping functions, not by fps.

Good test spots: Heartland Dr / Liberty St houses & sidewalks 41.6489,-88.4430 (also 41.6545,-88.4330); Kendall Marketplace lots & shops 41.6558,-88.4397; Yorkville Grade School 41.6487,-88.4478 (the brick two-storey there is Parkview Christian Academy); Traughber Junior High + gym 41.6702,-88.3302; 353 Emily Ct (complex roof, 3-car garage) 41.63328,-88.40325; Prairieview Dr, Oswego (3-car garages); Oswego Meijer (store interior); Yorkville garages ~41.6385,-88.4420; Oswego High (orange/navy accent lights).

### Sharing an unpushed build with the owner
Push a `claude-test-<thing>` branch and send `https://raw.githack.com/unclestev/explorer3D/<FULL commit sha>/index.html` (short shas can fail to load some files). githack is a long-running third-party proxy that serves repo files as pages — test builds only, never the public game. It's a separate origin (own localStorage).

### Offline harnesses (rebuild as needed; details in the archived notes)
- **Cockpit renders**: three.js r128 page loading `cockpit.js` with stub globals, rendered via Playwright + headless Chromium `--use-gl=swiftshader` (addendum 7 / 5). Get r128 with `git clone --depth 1 --branch r128 --filter=blob:none --sparse https://github.com/mrdoob/three.js && git sparse-checkout set build`. The game renders linear, no tone mapping — match that.
- **Models**: render a `.glb` in a small three.js page (GLTFLoader) from fixed angles (addendum 9/11 list the angles matching his photos).
- **Traffic logic**: node `vm` loading traffic.js with stub globals and a hand-built graph (addendum 13). Note `drive(a,dt,px,py,pv,ph)`: speed before heading.
- **Input logic**: node `vm` with controls.js + wheel.js and fake gamepads (addendum 6). In a page: override `navigator.getGamepads` and fire `gamepadconnected`.
- **Footprint/plan checks**: dump buildings/roads (metres from a point) from the live page as JSON and plot with matplotlib — clearer than 3D screenshots (addendum 24).
- **Sound**: render the worklet in an `OfflineAudioContext` and analyse the WAV.
- When testing music in a browser, override `window.Audio` with a muted one — don't play sound on the owner's computer.

## 5. Architecture map

Load order (index.html): errors.js → update.js → **game.js** → `js/enh/` modules (core.js first … boot.js last). See README.md for a one-line description of every module.

- **game.js** (~1650 dense lines): map setup (`maxPitch` 85, `maxZoom` 24), `S` state, vehicles + physics + `steerLock(v)`, camera (`aimCam3D`, `viewPitch`), car photos/models (`CARS`, `CARKEY`, `CARSPEC`, `setCar`, `loadModel`), trees (`buildDecor`, `treeFeats`), towers, glider, `FRAME_HOOKS`, `setMode` + `onModeChange`, graphics levels (`QL` 0/1/2, `QMODE`, `Q3(low,med,high)`, `POWER` = Graphics Low — there is no separate battery-saver switch), `applyQuality`, `SPEEDUP`/`setSpeedScale`, terrain mode (`ydTerrain` off/chase/all), road data (`roadGeo.segs`, `nearRoadGeo`, `offRoad`, `placeClear`), `QGEO()`/`geoBlocks`/`geoRoads`/`geoLand` (no-GPU-readback lookups), `ovFetch` (Overpass queue), `HIDE` + `applyHides()`, `driveSide()`.
- Rendering: MapLibre draws the world (tiles, fill-extrusion buildings, our GeoJSON layers); a three.js **car layer** (`scene`, `camera`, `renderer`; scene units = pixels, scale `1/mpp`) draws the car, traffic, person, 3D signs, glow points; the **cockpit** has its own three.js scene drawn on top; indoor rooms are three.js too.
- Key modules: `controls.js`/`controls-view.js` (all input + Controls screen), `wheel.js`/`ffb.js` (G29, WebHID wheel motor), `cockpit.js` (~2300 lines: interiors, mirrors, screens, HUD, rain/wipers, view distance), `traffic.js` (road graph, lanes, curves, yielding, `OCC` depth-only building blockers), `vehicles.js` (traffic models), `buildings.js` (walls redrawn per building, roofs incl. `wingRoof`, facades, doors/garages, porch lights, `zoneAt`, `isHouseA`), `walk.js` (on foot, first-person rooms, light switches, gym decor, swim/skate), `traughber.js` (Traughber Jr High from the owner's aerial photo), `stores.js` (Meijer), `parking.js` (lots from Overpass, stalls), `roadside.js` (sidewalks, poles, lights, asphalt), `smooth.js` (rounded road curves), `textures.js`, `atmos.js` (time/weather/headlights), `snowcover.js`/`snowmen.js`/`plow.js`, `rink.js`/`ice.js`, `music.js`/`tube.js`/`phone.js`/`voice.js`, `signals.js`, `ignition.js`, `park.js` (Park Assist), `glidelod.js`, `quality.js`, `feel.js`, `savepos.js`, `teleport.js`, `progress.js`/`challenges.js`/`police.js`.
- Settings are persisted in localStorage under `yd*` keys (e.g. `ydCar`, `ydQual`, `ydQAuto`, `ydTerrain`, `ydReal`, `ydAsphalt`, `ydSat`, `ydAudio`, `ydTraffic`, `ydWheel`, `ydPos`, `ydStart`, `ydSide`, `ydLights`, `ydSmooth`, `ydCarSize2`, `ydZoom`, `ydTrailShow`, `ydRadioPresets`). Renaming a key loses players' settings — migrate instead.
- ⚙️ Settings are tabs: Vehicle · Driving · View · Map · A/V · Places.
- Graphics Auto: phones start at Low and climb to Medium at most (30 fps cap on touch); PCs start High. A "too slow" verdict is remembered (`QAUTO.cap`); tapping Auto resets it — tell the owner when a fix should let a higher level work again.

## 6. Pitfalls learned the hard way (MapLibre 3.6.2 / three r128 / map data)

- **OpenFreeMap shares one building id across whole subdivisions** (Heartland Dr: one id, 1172 polygons; Traughber's school + ~140 houses). Never hide, identify or pick buildings "near a point" by id or by a low area cut. Building layer filters go only through game.js `applyHides()` (`HIDE.walk` / `HIDE.vec` / `HIDE.pin` / destroyed) — never `setFilter` them directly. Near the car, buildings draw from the GeoJSON source `walls` (layers `wall-3d` / `wall-pat` / `wall-cap`), not the vector `building-3d`.
- With 3D terrain, MapLibre lifts each fill-extrusion feature by the ground height at its centroid → anything stacked on a building must stand on a per-building feature (why walls are redrawn per building). Every ground layer is drawn once per terrain tile: **layer count matters more than triangles**; invisible (opacity ~0) layers still cost full price — use visibility `none`.
- With terrain on or in the cockpit, avoid `queryRenderedFeatures` (GPU read-back, ~10 ms each): use `QGEO()` / `geoBlocks` / `geoRoads` / `geoLand`. `querySourceFeatures` features decode geometry on every `.geometry` read — read it once.
- **Road line layers draw from the GeoJSON source `roads-smooth`** (smooth.js), not the vector tiles, and the style's road layers are moved onto it a moment after load — code that finds road layers by `'source-layer'==='transportation'` must also accept `source==='roads-smooth'`, and layers added next to them must wait for `map.getSource(layer.source).type==='geojson'`. Road **data** for physics/traffic/autopilot still comes from the vector tiles.
- Anything asphalt-like follows ⚙️ Asphalt roads (`ROADSIDE.state.asphalt`, `ROADSIDE.setAsphalt`); lots use `TXLOT`.
- Ground textures are opaque and cover the style's fills (which stop at zoom 13). A new ground class needs a texture in textures.js `LANDUSE`/`LANDCOVER` **and** an entry in game.js `lu-tint`'s exclusion list, or it shows washed out. OpenMapTiles has class `education` for school grounds — easy to miss.
- **Bright lights can't be map shapes** (the map's night light dims every fill-extrusion): put a glow in the car-layer three.js `scene` like buildings.js `lampGlow`. Night-only shapes go in their own layer shown only at night.
- Anything added to traffic.js `OCC` blockers must be a kind that the "building you're in" test (`mine()`) drops, or it hides the indoor room's own walls.
- buildings.js has its own local `const TRJ` (colours): reach traughber.js there only as `window.TRJ`. `HIDE.pin` hides an id only in the map's own layers; walls skip the pinned building's rings via `window.TRJ.skip`.
- Map patterns (`fill-extrusion-pattern`) are screen-pixel sized — they shrink in world size as the camera zooms in.
- MapLibre internals we depend on (recheck after any upgrade): `map.transform.fov`, `coveringTiles`, `getHorizon`, `_calcMatrices` / `_minEleveationForCurrentTile` (cockpit far plane), `pixelMatrix3D` / `locationCoordinate` / `map.terrain` (tower beacons), `map._render` (fps meter), `map.painter.renderLayer` (benchmark).
- three.js r128 skips an object only if `visible === false` exactly — `visible=0` still draws. Cockpit glass is transparent with depthWrite off: anything that must hide the glass frit (pillars) draws after it (transparent + higher renderOrder).
- Per-frame checks that walk building footprints are expensive in dense cities (downtown LA froze): rely on the depth-only `OCC` blockers instead of per-object sight-line walks.
- Overpass mirrors are slow and refuse parallel questions: `ovFetch` queues one at a time; cap any wait a user sees at ~18 s and have a fallback.
- `typeof x` on a `let` still in its temporal dead zone throws — only reference module `let`s from callbacks that run after load.
- Gamepad button index 0 is falsy: test bindings with `b.b!=null`, never `!b.b`.
- Don't name locals `a`/`b` inside signs.js `computeBlades` loops (loop counters; crashed every run once).
- Map/network failure after sleep can leave houses black (wall images `hw-`/`cw-` missing) with a red "MAP: Failed to fetch" banner; a reload fixes it. Hardening not done (see §7).
- Radio Browser / Open-Meteo / tiles may be blocked from a sandboxed shell; test them from the game page in a browser.

## 7. Status and unfinished work (as of 2026-11-27)

**On `main`** (459db99): everything through addendum 29 — garage bay count from the garage face, gym night lights, multi-door garages + driveway pads, roof wings, door placement from paths, houses vs shops from land use + business points, Traughber walls on the real footprint, swim/skate/rinks, glide LOD, interiors, exit signs, porch/accent lights, grass/siding, snowmen, smooth roads, curved traffic + yielding.

**Not on `main`:**
- **Benchmark** (`js/enh/bench.js` v2, traffic.js v35) — only on test branch `claude-test-bench` (7c9688b). Settings → Benchmark: "Yorkville" (reloads at Heartland Dr with `?bench=std&hour=13&wx=0`) or "Here". First iPhone run (Low via Auto): 29.1 fps, 19 stutters >50 ms, game code max 77 ms, ~1,974 map draw calls but only 211k triangles → **draw-call count is the phone's cost**. Waiting on the owner to rerun on **Graphics High** with the v2 build (names the "slow pieces"). Merge to main only on his say.

**Open questions put to the owner**
- Should every 3-car garage show three separate doors? (Now 3-car = double+single mostly, three singles sometimes.)
- Which machines to benchmark; must the phone keep every new visual?
- Roadmap steps 1–3 (§3) — not started.

**Known gaps / ideas offered, not built**
- Black houses after a network drop: re-add wall images on `styleimagemissing` or after a WebGL context restore; clear the red map-error banner once the map recovers.
- Concrete vs asphalt driveways can't be told apart (tiles only have paved/unpaved); houses with a garage but no mapped driveway get a straight pad "to nowhere".
- Garage interiors with several adjacent bays, night look and snow on pads untested; roof wings at night/snow and in other cities untested; townhouse rows (450–900 m² in residential zones) now count as houses.
- Other schools' gyms are only detected as a separate compact building (`isGym`); a gym at another school is untested. OSM `entrance=*` nodes and `building:part` not used yet (the Overpass route could fetch them). USGS 3DEP lidar heights (Overture `est_height`) not used.
- Rinks: outdoor rinks only if mapped as water; no AI goalie; you can skate through the nets; no stick in first person; skating/splash sounds.
- Glider: fade-in instead of pop at LOD tiers; measure before/after.
- Ordinary windows' night glow is dull (could get glow points like the porch lights).
- Autopilot passing untested on real bends/intersections. Wall/tree hits bounce straight back (no sliding). No skid marks, wheelspin, swerving/honking traffic, rain sound.
- Controls screen: defaults only; custom profiles (named, export/import, click-to-rebind with conflict prompt) planned. G29 button numbering and drawing positions are by eye — not yet confirmed on his real wheel.
- Map still draws every building in view in dense cities; offered: cap building draw distance there.
- Issues: **#2** button-mapping screen (phase 1 done: Controls screen) and **#3** AI cars stopping in intersections (likely helped by later traffic work; owner to confirm before closing). Open PR **#69** (ffb-diag, jjcodesnow) — not ours, not asked to merge.
- ~150 old branches on GitHub (merged PR branches and `claude-test-*`). Only the owner can delete them.
- The README's module list is a little behind (e.g. it still says "battery saver"); keep it updated when adding modules.

## 8. Change log
- 2026-11-27 — Moved project management from claude.ai project notes to Claude Code: this CLAUDE.md, archived notes in `docs/claude-notes/`, `tools/check.sh`, `.claude/` settings and commands.
