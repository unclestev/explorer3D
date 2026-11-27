# Addendum 26 (2026-11-24): roofs for houses with wings (353 Emily Ct, Yorkville)

Branch `roof-wings` (test branch `claude-test-roofwings`, commit 8370aad, buildings v42). NOT on main: waiting for the owner's "push". Main has everything up to door-hints (5132de6, buildings v40).

## Owner report
"353 Emily Ct in Yorkville (complex building) draws with a flat roof. Anything we can do for complex structures?"

## Causes (js/enh/buildings.js)
1. The footprint is 486 m2 (23 corners). A "house" was 25-450 m2, so it counted as a store/office: flat grey roof + rooftop AC units, shop-style facade.
2. Houses with odd outlines (rect fill < .85) got ONE hip roof made by shrinking the whole outline until the narrowest wing closed: for a house with wings that plateaus at a tiny rise (looks flat).

## Fix
- `isHouseA(h,b0,A,cx,cy,kx,ky)` = up to 12 m, 25-450 m2, or up to 900 m2 where `zoneAt` says no school/shop/industrial zone. Used in walls (textures), roofParts and facades (all three had their own copy of A<=450). Outline limit for house roofs 40 -> 80 corners.
- `wingRoof(p,B,slices,pitch,seed,c,top,toLL)`: in the outline's long-axis frame, edges must run along or across it (small bits under 2.5 m excepted). Compress the vertex coordinates, find all maximal inside rectangles, greedy-cover (max 9 rects, none left uncovered or null), each rect gets a gable (ridge along its long side) or hip with the same pitch, stacked slices so the higher wing wins and valleys form by themselves. Rects under 2.2 m wide (porches) stay flat. Returns null for angled walls -> old shrinking hip roof.
- Roof slices are shaded darker at the eaves to lighter at the ridge (shade(c,-.1+.2t)) so slopes/valleys read (flat colour hid them).

## Checked live
353 Emily Ct (41.63328,-88.40325): several gables/hips with valleys, shaded; neighbours (349 etc.) unchanged. NOTE for testing: if the player's S position is INSIDE a house footprint the game hides that house's walls (walking-inside logic): put S on the street.
Not checked: night/snow look, townhouse rows (now count as houses when 450-900 m2 in a residential zone), other cities.
