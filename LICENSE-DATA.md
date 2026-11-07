# Data licence

**The derived geodata published with NUST World is licensed under the Open Database License (ODbL) 1.0**
(https://opendatacommons.org/licenses/odbl/1-0/). Reason: ODbL data (OpenStreetMap, Overture Maps) is merged into it,
and ODbL requires a derived database to be shared under the same licence, with attribution.

## What this covers

| File                                                                    | Content                                                                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `public/data/nust-full.geojson`                                         | OpenStreetMap extract (Overpass export)                                                        |
| `public/data/topo-merge.json`                                           | provisional buildings, hostel outlines, suppressed duplicates, flags, regions (Overture, ODbL) |
| `public/data/topo-trees.json`                                           | individual tree positions with canopy height and crown radius                                  |
| `public/data/campus-boundary.geojson`, `public/data/context-roads.json` | campus outline and surrounding roads (OSM, ODbL)                                               |
| `public/data/topo-terrain.json`                                         | coarse terrain heightmap (derived from 5 m contours of a 30 m model)                           |
| `data/topo-buildings.geojson`                                           | Overture buildings in the campus frames, with source, confidence and merge action              |

## Required attribution

> © OpenStreetMap contributors · Overture Maps Foundation · terrain/canopy data CC BY 4.0 (per the export licence files)

It is shown in the footer of the site and repeated in the About panel and the README.

## Sources and their terms

| Data                                            | Source                                                                                                                                                               | Licence                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Map features                                    | OpenStreetMap contributors                                                                                                                                           | ODbL 1.0                                                                                           |
| Building outlines, roads                        | Overture Maps Foundation, release 2026-10-21.0 (downloaded directly)                                                                                                 | ODbL 1.0                                                                                           |
| &nbsp;&nbsp;upstream: Microsoft ML Buildings    | via Overture                                                                                                                                                         | ODbL-1.0 (declared on each record)                                                                 |
| &nbsp;&nbsp;upstream: OpenStreetMap             | via Overture                                                                                                                                                         | ODbL-1.0                                                                                           |
| &nbsp;&nbsp;upstream: **Google Open Buildings** | via Overture                                                                                                                                                         | **not used**: excluded by default (records carry no licence field; see `data/topo-overrides.json`) |
| Tree canopy height                              | Meta and World Resources Institute, Global Canopy Height Maps v2, via TopoExport                                                                                     | CC BY 4.0                                                                                          |
| Terrain (30 m)                                  | OpenGeoHub Ensemble Digital Terrain Model (EDTM) 2023: Ho, Y.-F., Hengl, T., Parente, L. (2023), Version 1.1, https://doi.org/10.5281/zenodo.7676373, via TopoExport | CC BY 4.0                                                                                          |

The TopoExport files (`reference/`) are the delivery format for the canopy and terrain data and are not redistributed;
their own licence files list the source licences above and disclaim accuracy ("verify with surveyors").

## What it does not cover

- The application source code (no licence has been chosen here).
- Building names, descriptions and heights curated by hand in `src/data/` (the project owner's own work).

This file describes how the data is handled; it is not legal advice.
