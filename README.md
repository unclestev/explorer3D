# Explorer 3D — Yorkville Driver

Drive a Ford Explorer over a real map. Play it on GitHub Pages.

## Files
- `index.html` — page markup; loads everything below in order
- `css/style.css` — HUD, controls and overlay styles
- `js/errors.js` — on-screen error overlay (phones have no console)
- `js/game.js` — map, vehicles (SUV, bass boat, tractor, hang glider), physics, camera, minimap, trees, water towers
- `js/enh/` — optional enhancements; each file is independent and wrapped so a failure can't stop the game
  - `core.js` — shared helpers (`window.YD`), must load first
  - `roads.js` — lane markings, bridges, rivers
  - `signs.js` — street signs, stop signs, traffic lights, rail crossings, speed limits
  - `nav.js` — tap-to-route navigation and breadcrumb trail
  - `atmos.js` — real time of day and live weather
  - `textures.js` — code-drawn ground textures and building colours
  - `search.js` — 🔍 destination search (address or place name)
  - `autopilot.js` — AUTO: drives the active route
  - `boot.js` — starts the modules; must load last

When a JS or CSS file changes, bump the `?v=` number on its tag in `index.html` so phones don't keep an old cached copy.

## Testing switches
- `?hour=21.5` fixes the clock; `?wx=63` fixes the weather (WMO code: 63 rain, 73 snow, 45 fog, 95 storm).
