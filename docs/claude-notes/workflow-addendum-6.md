# 3D Driving Game — workflow addendum 6 (2026-11-22, night)

Read after `start-here.md`; newer than addendum 5. (Between 5 and 6, jjcodesnow / the owner merged YouTube on the centre screen #46-#50, the screen's power key #51, dash hazard + start buttons #52, voice commands on the G29's ≡ button #53, "play 93.9" radio #54, voice controls almost everything #55 — see git log. Voice works by clicking the on-screen buttons, so it doesn't depend on keys.)

## Controls screen (pushed 2026-11-22 ~22:20 as e0ecb0e, merged with #54/#55; music.js ?v=8, voice.js ?v=4; live)
Owner asked for an ATS-style key mapping screen that also shows **visually** what each G29 / shifter button does (his ATS complaint: you can't see what's already mapped). Decisions:
- **Phase 1 = defaults only, display only.** No customisation yet, but it must be built so custom profiles slot in later (owner likes named profiles + export/import).
- Xbox controller included now. Keyboard: both a list (Key 1 / Key 2) and a drawn keyboard.
- Combos: I decided — keep both-paddles = Drive/Reverse (wheel) and LB+RB = hazards (controller) as combo bindings, shown on the drawings.
- New actions he asked for: horn, headlights, wipers key, washer fluid, next/prev, volume, look straight ahead.
- Phones / touch without an input device: the ⚙️ row is hidden. General rule from the owner: **make controls touch-capable whenever possible when building features.**

### How it's built
- `js/enh/controls.js` (`window.CTRL`): action list (`id, g` group, `label, t` press/hold/axis, `run`, `undo`, `rep`, `always`) and `DEFAULTS` for `keyboard` (KeyboardEvent.code, [primary, secondary]), `wheel`, `pad`. Binding shapes: `{b:n}`, `{b:[n,m]}` combo, `{shift:n}`, `{pedal}`, `{hat:1}`, `{axis:n}`. `layout(kind,devId)` = defaults + wheel buttons learned in ⚙️ (start/view/shifter) on top (a learned button drops other actions on it). **Every key/button goes through it now**: the old per-file keydown listeners (game.js K/G, cockpit C/H/Q/E, music M, voice V, signals [ ] \, ignition I, walk F) were removed. game.js reads `CTRL.held('gas'|'brake'|'steerL'|'steerR'|'handbrake')`; cockpit reads `lookL/lookR`.
- `wheel.js` passes the wheel / controller to `CTRL.poll(g,kind)` each frame (edge detection, combos with undo within 0.25 s). It keeps steering, pedals + calibration, the D-pad hat / right-stick look, and the gear selector (shifter slots from `CTRL.buttonsFor('wheel','gearD'|'gearR')`). `WHEEL.toggleGear()`, `WHEEL.learned(id)`, `WHEEL.device()` added.
- `CTRL.paused` (set while the screen is open): actions don't fire, pedals read 0, look is frozen; presses still reach `CTRL.onLive` so the screen lights them.
- `js/enh/controls-view.js` (`window.CTRLVIEW`): full-screen overlay, tabs Racing wheel / Controller / Keyboard (opens on the connected device, switches to whichever device is pressed). Drawings are original SVG (no logos); control positions are plain numbers in `wheelCtls()` / `padCtls()` — **G29 positions are by eye, owner may ask to nudge them**. Labels coloured by group; hover/tap row ↔ control cross-highlight; live green on press; live pedal bars and steering needle. Opened from ⚙️ → Driving → Controls (`#ctrlRow`, shown if `any-pointer: fine`, a key press or a gamepad) or the `/` key.
- Future editor: make the list chips and drawn controls clickable → "press a key/button" → conflict prompt (replace / swap / cancel); store profiles as JSON layouts per kind in localStorage; `CTRL.relayout()` re-reads.

### Default layouts
- Keyboard: WASD/arrows, Space handbrake, I engine, B horn, L headlights, P wipers, O washer, [ ] signals, \ hazards, C view, H HUD, Q/E glance, R look ahead, M music, , . prev/next, - = volume, V voice, F walk, G glider, / controls screen.
- G29 (indices from 0, assumed Chrome numbering — **not yet confirmed on the owner's wheel; the G29 wasn't connected to the PC he was on**; the screen lights pressed buttons, so he can check): ✕0 horn, ◻1 headlights, ○2 view, △3 look ahead, paddles 4 R / 5 L signals (both = D/R until the shifter is used), R2 6 wipers, L2 7 music, Share 8 hazards, ≡ 9 voice, R3 10 washer, L3 11 HUD, shifter 12 = D, 13 and 18 (R slot) = R, 14-17 = N, + 19 / − 20 volume, dial 21 right next / 22 left prev, Enter 23 engine, PS 24 unused, hat = look.
- Xbox: RT/LT gas/brake, left stick steers, right stick looks, A horn, B handbrake, X engine, Y D/R, LB/RB signals (both = hazards), View cockpit, Menu music, LS click headlights, RS click look ahead, D-pad up wipers / down washer / left prev / right next. (D-pad no longer looks around on the controller.)

### New action implementations
- Horn: `sound.js` `SOUND.horn(on)`, polled from `CTRL.held('horn')` every 30 ms (works parked / engine off); sawtooth pair through band-pass; per car (Ford/Lincoln ~410+510 Hz, Javelin lower, Model Y single, tractor low).
- Headlights: `atmos.js` `window.LIGHTS` (`ydLights`: auto/on/off); `lightsOn()` is a hoisted function because `applyAtmos` can run before the module finishes.
- Washer: `cockpit.js` `CK.washer()` paints streaks on the rain canvas, `CK.washN=3` strokes counted when the blade parks; `SOUND.squirt()`.
- Music: `MUSIC.next/prev/volStep` (prev restarts the song if >3 s in; radio steps presets).
- `CK.hudToggle`, `CK.recenter`, `window.WALK.toggle`.

### Testing done
- `node --check` all files; node vm harness with stub globals (`/home/claude/cv/t.js`, 28 checks: keys, holds, repeat, paused, wheel buttons, paddle combo + undo, shifter D/R/N incl. R slot, learned start override, pad buttons and LB+RB hazards). Offline renders of the screen with playwright (`/home/claude/cv/page.html`, `shot.py`).
- Live after the push (browser pane): CTRL / CTRLVIEW / LIGHTS / washer / horn / MUSIC.next present, ⚙️ row shows, W sets the gas input (kG = 1), ] turns the right signal on, screen opens with all controls drawn, no new console errors. Not yet tried by the owner on the real G29 or Xbox controller.

### Session notes
- `add_repo` push was denied at session start but succeeded when retried after the owner said "push"; pushed from the existing read-only clone at /home/claude/explorer3D (`git -c push.negotiate=true push origin HEAD:main`).
