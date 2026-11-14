# Field checklist (verify on campus)

1. **Ghazali 2** and **Rumi I**: Overture and OSM outlines differ by about 10.9 m. OSM is kept; both are flagged in `?debug=1`. Check which is right.
2. **Swimming Pool Area**: earlier flagged at 3.9 m, but that was a fit artefact. After the exact UTM fit it no longer differs. Nothing to check.
3. **SEECS blocks and NUST School of Health Sciences**: topo says about 30 m, we show 10.2 m and 3.4 m. Heights unchanged until you confirm floors.
4. **16 provisional buildings** (dashed, unnamed): confirm each exists, name it, then map it in OSM. Coordinates in `docs/needs-osm-outline.md`.
5. **Razi Hostel Area (Rehmat Hostel and Razi 1)**: both are **template-based, approximate**: exact copies of the
   Ghazali 1 (Rehmat) and Ghazali 2 (Razi 1) footprints, placed by `data/hostel-placement.ts`.
   - **Which way does each entrance face?** Stand at each main door and note the compass direction (or which road it
     faces). In the app both face the curved loop driveway (way/1213687790), north-east: Rehmat about 70°, Razi 1 about
     85°. If one is wrong, say "rotate Razi 180" or "mirror Rehmat"; open `?debug=1`, the cyan arrow shows the side.
   - Positions: Rehmat is anchored on the one Overture outline (1,704 m², about 33.64010, 72.98655, next to Rehmat
     Hostel Parking) and shifted 14.6 m south-east to clear the parking and the loop; Razi 1 sits south of it
     (centroid about 33.63952, 72.98678). Confirm the order (Rehmat north, Razi 1 south) and roughly where each stands.
   - Is the Overture outline Rehmat Hostel's real shape? If yes, trace it in OSM as `name=Rehmat Hostel`.
   - Floors: shown as 4 x 3.0 m from your photos (unverified). **Please note which wings are 3 floors and which are 4.**
   - The **curved central block's height is unverified** (also flagged in `?debug=1`).
   - The roof drum, its vent row and the entrance canopy on 4 columns are approximate decoration: confirm position and size.
6. **Attar 2, Amna**: still not in OSM or Overture; no outline.
7. **Rumi II**: OSM has two identical ways (way/209832719 and way/1364559421). One is hidden in the app; delete the duplicate in OSM.
8. **Trees**: 6,025 positions come from a coarse canopy model; spot-check a few lawns.
9. **Terrain** (optional): walk a slope and compare with the shown relief (about 38 m across campus, approximate).
