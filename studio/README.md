# FieldNote Studio

The desktop authoring side of FieldNote — think **QGIS ported to an app**. All the
professional GIS machinery (layer tree, per-group symbology, attribute tables,
COGO line entry, mudmap page layouts, print composer) surfaced the way Google
Maps or ArcGIS Field Maps would surface it: one obvious action on every screen,
everything else one tap deeper behind *Advanced*.

## What it does

- **Survey authoring** — draw points, lines and areas on the map; typed start
  coordinates and bearing + length (COGO) entry; vertex-level fix-ups; photos
  and notes on any feature; spreadsheet import with attribute round-tripping.
- **QGIS-style layers** — groups, per-group and per-feature symbology,
  attribute tables, decluttered one-per-line labels.
- **Exports** — one Export tab, three deliverables:
  - *Interactive map* — a single self-contained `.html` (satellite + sjøkart)
    with every feature, its notes and photos.
  - *Report* — print-ready A4 issue assembled from standard blocks
    (cover, methodology, mudmap sheets, line schedule, photo appendix, sign-off).
  - *Data* — spreadsheet-ready CSV.
  - Mudmap page extents, sheet orientation, report blocks and per-format CSVs
    live under **Advanced export options**.
- **Basemaps** — Esri satellite/hybrid, Kartverket sjøkart & topo, Carto
  light/dark. All open and keyless.

## Run it

```powershell
npm install
npm run dev
```

Then open http://localhost:5181. Verify with:

```powershell
npm test
npm run build
```

## Provenance

`src/app/gis/` is a copy of the Fleo `feat/gis-map-core` tree (minus the two
backend-bound files, `GisMapPage.tsx` and `useGisData.ts`); `src/api/maps.ts`
is a type-only shim standing in for the Fleo backend module, so files diff
cleanly against the Fleo repo in both directions. The entry point is the dev
harness (`src/dev/gisHarness.tsx`) — mock sites and vessels, no backend, no
auth. The mobile collection app lives one directory up in `../`.
