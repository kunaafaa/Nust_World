## Linking menus to map places

Linked: `c1`, `c2`, `c3` and `retro`. `data/menus/retro.json` is "Retro Cafe" (46 items, 14 categories); it is linked to landmark `retro-8873` (OSM way 670478873, "RETRO", amenity=cafe) with aliases `RETRO`, `Retro`, `Retro Cafe`.

Not linked, because there is no single certain match (each needs a human check before `menuId` is set):

| menu          | candidate in `nust-full.geojson`                                                              | why it is not linked                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| coffee-lounge | node/13155098601 "Coffee Lounge" (amenity=cafe), 33.64758, 72.99084, about 100 m east of IESE | It is only a point. No building outline exists there (the point sits inside a car park/forest area), and there is no landmark to attach a menu to. It needs an outline or a landmark entry first. |
| c4            | way/670479588 "c4" (amenity=cafe, outdoor seating), 33.63573, 72.98900                        | Name matches, but it has no building tag and is not a landmark yet. "C4" could also mean a different building. Confirm on site.                                                                   |
| s3h           | way/536942055 "S3H" (building, landmark `s3h-2055`)                                           | This is the S3H building, not a tagged cafe. The cafe may be inside it, but nothing in OSM says so.                                                                                               |
| nice          | way/209189592 "NICE" (landmark `nice-9592`, academic building)                                | This is the NICE institute building. Nothing in OSM says the "Nice Cafe" is inside it.                                                                                                            |
| inno          | none                                                                                          | No feature with this name. Only "Innovation Drive" (a road) and NSTP Cafe (way/1056121375), which is a different cafe.                                                                            |
