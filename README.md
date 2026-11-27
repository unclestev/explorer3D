# Explorer 3D — Yorkville Driver

Drive a Ford Explorer over a real map. Play it on GitHub Pages.

Working on the code (people or Claude Code): read `CLAUDE.md` first. Project history: `docs/claude-notes/`.

## Files
- `index.html` — page markup; loads everything below in order
- `manifest.webmanifest`, `favicon.ico`, `icons/` — app name and icons (Yorkville Foxes logo) for the home-screen app and browser tab
- `css/style.css` — HUD, controls and overlay styles
- `js/errors.js` — on-screen error overlay (phones have no console)
- `js/game.js` — map, vehicles (SUV, bass boat, tractor, hang glider), physics and steering, camera, compass, pedals, trees, water towers
- `img/explorer-rear.webp` — cut-out photo of the Explorer ST used as the car body (`?car=3d` in the address shows the 3D model instead); `img/explorer-top.webp` is a spare, more top-down view
- `models/` — 3D model cars: `javelin-amx-v3.glb` (the AMC Javelin AMX, made by `tools/make-javelin.py` from the owner's photos), `muscle-70s.glb` (the 70's Muscle Car, `tools/make-muscle70.py`), and `model-y.glb`, the 2023 Tesla Model Y, made by `tools/make-model-y.py` from the owner's photos (after changing the script: `python3 tools/make-model-y.py models/model-y.glb`, needs numpy and scipy, then bump the model's `?v=` in `CARS` in `js/game.js`)
- `tools/photos/` — the owner's Model Y photos used as textures on `model-y.glb` (rear, left side — mirrored for the right — and front; licence plates blanked, background greyed out), with each photo's car outline and fitted camera in `model-y-photos.json`; `tools/fit-model-y-photo.py` re-fits a camera after the body shape changes
- `js/enh/` — optional enhancements; each file is independent and wrapped so a failure can't stop the game
  - `core.js` — shared helpers (`window.YD`), must load first
  - `roads.js` — lane markings, bridges, rivers
  - `signs.js` — street signs, stop signs, traffic lights, rail crossings, speed limits
  - `nav.js` — tap-to-route navigation and breadcrumb trail
  - `atmos.js` — real time of day and live weather
  - `textures.js` — code-drawn ground textures and building colours
  - `search.js` — 🔍 destination search (address or place name)
  - `autopilot.js` — AUTO: drives the active route
  - `vehicles.js` — the four traffic car designs (luxury SUV, full-size SUV, off-road pickup, 1970s muscle coupe), wheels that spin and steer
  - `sound.js`, `engine-worklet.js` — synthesized engine sounds per car (the Model Y's motor whine, regen and pedestrian-warning hum too)
  - `cockpit.js` — the cockpit view: each car's interior (the Model Y: centre screen instead of gauges, glass roof, ⚙️ seat colour)
  - `traffic.js` — AI cars on the real road network (right-hand lanes, one-ways, stop signs, red lights)
  - `settings.js` — ⚙️ panel (battery saver, traffic, car size, zoom) and pinch-to-zoom
  - `progress.js` — play time, miles, safe-driver score, streets and landmarks, the 🏆 panel
  - `challenges.js` — time trials and glider challenges (only when started from 🏆)
  - `police.js` — police chases (only when Police patrols is switched on in 🏆)
  - `walk.js` — 🚶 get out of the car and walk/run as a person; the car stays parked, 🚗 gets back in
  - `look.js` — drag one finger on the map to look around (orbit / tilt) in every mode; tap the compass to look ahead again
  - `buildings.js` — roof caps in roof colours, pitched roofs on nearby houses, rooftop units on stores/offices
  - `signals.js` — turn signals and hazards: G29 paddles, `[` `]` `\` keys, ◀ ⚠ ▶ on screen; each car's own tick-tock (Ford, Lincoln, Tesla, 1970s flasher, tractor), self-cancel, lamps on the car and arrows in every cockpit
  - `music.js` — car music: tap the centre screen in cockpit view (or press M), type a song or artist, and the car plays Apple's free 30-second preview (iTunes Search API, no key; explicit songs left out); 📁 My music plays whole songs from your device; what's playing shows on the centre screen
  - `tube.js` — YouTube on the centre screen: Music → ▶ Video, paste a YouTube link; it plays in YouTube's embedded player laid over the screen in cockpit view (pauses while the car is moving)
  - `ffb.js` — wheel motor: on autopilot a Logitech G29 / G27 turns by itself (WebHID, ⚙️ Wheel → "Wheel motor" once); hold it away to take over
  - `plow.js` — the snow plow's amber light bar flashes while its engine runs (model: tools/make-snowplow.py)
  - `snowcover.js` — snow settles on the ground and roads while it snows and melts after; the snow plow clears a lane
  - `snowmen.js` — once the snow is deeper than 3 in, snowmen stand in about one front yard in four near the car
  - `park.js` — Park Assist in the Explorer and the Expedition: tap the wheel's PS button (or 0, or Ⓟ) to scan, hold it to self-park centred in a painted stall (parking.js stalls); the centre screen shows the Perpendicular Park steps, ending with the chequered flag and the finish chime
  - `stores.js` — Meijer stores (found from the map tiles, OpenStreetMap or the place search; say "this is Meijer" to mark one): a way in through automatic glass doors (they slide open as you come up) on the parking-lot side even when the map gives the building none, and inside a high dropped ceiling with rows of parabolic-louvre troffer lights A big overhead garage door (loading door) sits left of the entrance: open it with the garage opener (K, the 🏠 button, your phone) and drive in.
  - `traughber.js` — Traughber Junior High built to the owner's aerial photo: the traced wings are fitted onto the school's real footprint at run time, then drawn in tan-orange brick under dark flat roofs (the map's own copy is hidden; nothing changes if the plan does not fit)
  - `parking.js` — parking lots: the map tiles have none, so surface lots near the car come from OpenStreetMap (Overpass) and are drawn as asphalt with painted stalls and a curb line; the tyres feel them too
  - `phone.js` — an in-game phone (📱 in the top-right bar, T, or say "open my phone"): Maps (with autopilot), Spotify (paste a link), YouTube Music (keeps playing in the background), Music, YouTube, Camera and Photos (on this device), Weather, Clock, Calculator, Notes, FordPass (your car pictured; lock, unlock, remote start, horn & lights, headlights, sunroof, wipers, hazards, switch cars), Voice, Settings, Controls. Pretend only: it can't call, text or connect to a real phone.
  - `voice.js` — voice commands: press ≡ (Options) on the G29 or V, say a command (start the car, hazards on, open the sunroof, play a song, navigate to …, what's my speed…), and the car does it and answers out loud (browser speech recognition and synthesis; Chrome / Edge)
  - `wheel.js` — the G29 / steering wheel: pedals learned in ⚙️, shifter, paddles, start button; the D-pad turns the camera (up / down look higher / lower, left / right look round); R2 switches the wipers on / off
  - `ignition.js` — engine start / stop: the G29's red-dial Enter button (or one set in ⚙️), the I key or ⏻; starter crank, catch and idle in the engine sound, gas off while stopped
  - `boot.js` — starts the modules; must load last

When a JS or CSS file changes, bump the `?v=` number on its tag in `index.html` so phones don't keep an old cached copy.

## Testing switches
- `?hour=21.5` fixes the clock; `?wx=63` fixes the weather (WMO code: 63 rain, 73 snow, 45 fog, 95 storm).
