# Explorer 3D — Yorkville Driver

Drive a Ford Explorer over a real map. Play it on GitHub Pages.

## Files
- `index.html` — page markup; loads everything below in order
- `manifest.webmanifest`, `favicon.ico`, `icons/` — app name and icons (Yorkville Foxes logo) for the home-screen app and browser tab
- `css/style.css` — HUD, controls and overlay styles
- `js/errors.js` — on-screen error overlay (phones have no console)
- `js/game.js` — map, vehicles (SUV, bass boat, tractor, hang glider), physics and steering, camera, compass, pedals, trees, water towers
- `img/explorer-rear.webp` — cut-out photo of the Explorer ST used as the car body (`?car=3d` in the address shows the 3D model instead); `img/explorer-top.webp` is a spare, more top-down view
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
  - `traffic.js` — AI cars on the real road network (right-hand lanes, one-ways, stop signs, red lights)
  - `settings.js` — ⚙️ panel (battery saver, traffic, car size, zoom) and pinch-to-zoom
  - `progress.js` — play time, miles, safe-driver score, streets and landmarks, the 🏆 panel
  - `challenges.js` — time trials and glider challenges (only when started from 🏆)
  - `police.js` — police chases (only when Police patrols is switched on in 🏆)
  - `walk.js` — 🚶 get out of the car and walk/run as a person; the car stays parked, 🚗 gets back in
  - `look.js` — drag one finger on the map to look around (orbit / tilt) in every mode; tap the compass to look ahead again
  - `buildings.js` — roof caps in roof colours, pitched roofs on nearby houses, rooftop units on stores/offices
  - `boot.js` — starts the modules; must load last

When a JS or CSS file changes, bump the `?v=` number on its tag in `index.html` so phones don't keep an old cached copy.

## Testing switches
- `?hour=21.5` fixes the clock; `?wx=63` fixes the weather (WMO code: 63 rain, 73 snow, 45 fog, 95 storm).
