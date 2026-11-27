# Addendum 21 (2026-11-23): school work

Pushed to main (cef0d49) after merging jjcodesnow's Traughber look (PR #98).

- Schools (buildings.js v=32): two storeys (8.2 m) where the map has the 1-storey default; gym = compact 700-3500 m2 building beside a school at least 2.5x bigger (heuristic, did not trigger at Traughber; untested). `res.bld.gym` feeds walk.js roomLook (school ceiling ~3.5 m, gym ~9 m with wood floor).
- Doors: main entrance mid street side, wing ends, one per ~35 m on long walls (max 22), lights either side. Windows: framed with mullion/transom/sill (`swin`), pitch 6.4 m front / 5 m elsewhere.
- Accent lights (`sfix`): between floors, louvred housing, orange up / navy down at Oswego High, white elsewhere, no middle light. Map layer can't glow at night, so beams are also a chain of coloured lamp sprites (lampsSet now takes per-point colour `k`).
- stores.js v=13: Meijer garage goes on the longest other wall when the front is short; no driveway needed for commercial/public buildings. Opener not driven in a live test yet.
