# Addendum 27 (2026-11-24): car no longer strips walls; land-use + business-point building classification

Branch roof-wings (test commit 333dc7b, NOT on main). Includes addendum-26 roof wings.

## Walls hiding when the car is out front
- Cause: updInside / garage.js hid a building's walls as soon as the car's centre was inside the mapped footprint (wings/porches reach the street).
- Fix: in the car the walls open only when the car is >= 2.4 m inside every wall (WALK.deepIn, walk.js v46, garage.js v2). On foot unchanged.

## Houses vs shops from global map data (buildings.js v44)
- zones() now also reads OpenMapTiles landuse residential/suburb/neighbourhood/quarter -> 'residential', commercial/retail -> 'commercial', plus 'poi' points whose class is in BLDCLS (allow-list: shop, grocery, fast_food, restaurant, bank, office, ... ; gates/bollards/pools/parking are NOT buildings).
- zoneAt priority: school > industrial > commercial > residential. poiAt(): a business point within sqrt(A)/2+3 m of the footprint centre.
- isHouseA: h<=12, b0==0, A>=25; school/industrial land -> never; POI inside and A>100 -> house only if residential land and A<=250; commercial land -> A<=120; else A<=900.
- Classification change (tiles streaming in) clears W.cache/CACHE (ZSIG).
- Live check around Kendall Marketplace, Yorkville: 65 siding-clad houses, 32 other buildings, 0 houses with a business point inside.
- Works anywhere OpenFreeMap/OpenMapTiles covers; no city-specific data. Zoning/parcel layers deliberately not used.
