# Field workflow update — 7 September 2026

## Product direction

Keep the field loop short: choose a job → choose a feature code → capture geometry → add observations → check the job → hand it over. The inspiration is code-based survey collection, with explicit phone-position uncertainty and fewer styling decisions in the main workflow.

## Implemented

- Job records: feature/photo counts, approximate line and route length, summed area, and a before-you-leave quality filter. Quality checks are separate from operator completion status.
- Field tools: point-to-point horizontal distance and true-north initial bearing, including last phone position to a recorded point. Refresh is explicit; stale positions are labelled.
- Capture: lines start with ordinary tap/GPS vertices, with freehand as an option. Delayed GPS callbacks cannot replace a cancelled capture or manual placement. Project changes cannot interrupt an active capture. Route messages distinguish native background tracking from foreground browser tracking.
- Observations: optional condition, priority, named custom fields with units supplied by the operator, and photo captions. Duplicate custom names are rejected. Failed storage writes leave the form available for retry.
- Photos: library images no longer receive fabricated current-location geotags. Camera images receive a recent device position only if available. Historic photo metadata is retained and its limitations are documented.
- Recovery: drafts retain their layer and geometry-edit identity and no longer expire based on an old record's creation date. Geometry edits retain previous coordinates and edit time/operator in the original JSON handover. Manual moves clear inherited altitude, heading, speed and accuracy readings.
- Geometry checks: coordinate ranges, distinct vertex counts, zero-area polygons and crossing polygon edges. Area arithmetic uses a local origin and wraps the date line. Distance arithmetic clamps roundoff near antipodes.
- Accuracy: new native observations retain provider estimates without speculative conversion. Per-position confidence references distinguish browser, Android and unspecified providers. Existing data is not rewritten.
- Exports: one recommended handover ZIP, photo reports, site maps, with individual CSV/GIS formats behind a disclosure. Save/share messages work across browser/native paths. Custom fields cannot overwrite built-in GeoJSON properties. CSV preserves custom fields and escapes formula-like text. Export builders scope data to the requested project.
- UI: larger input/touch targets, less decorative export chrome, clearer labels, responsive job summary, and no collection-button overlap with a selected feature panel on phones.

## Handover contents

| File | Purpose |
| --- | --- |
| START-HERE.txt | File guide, units, position sources, interpretation limits |
| records.csv | One row per feature, attributes, measurements and review reasons |
| positions.csv | Every vertex, timestamps, sensor readings and provider reference |
| map.geojson | Valid geometries with attributes and position metadata |
| photos.csv and photos/ | Original embedded image bytes and record/caption links |
| original-data.json | Complete project, records, embedded photos and geometry history |

Invalid geometries remain in the tables/original JSON but are omitted from GIS geometry files. Original JSON is for preservation; this release does not implement automatic restore. All records are included regardless of layer visibility.

## Validation

- 64 tests pass, including handover ZIP content checks, project isolation, text escaping, custom-field collisions, date-line areas, cardinal bearings, invalid geometry, route timestamp ordering, and observation-form storage failures.
- `npx oxlint src` passes without warnings.
- Production TypeScript/Vite/PWA build passes. Vite still reports the existing large application chunk warning.
- Browser checks at desktop size and 390 × 844: records summary, export layout, ZIP download feedback, map tools, manual coordinate entry and observation form. No test record was saved.
- Full-repository lint has pre-existing warnings in the separate Studio app.

## Remaining boundaries

Phone positions may combine GNSS, cellular and Wi-Fi; the platform does not expose a reliable breakdown. Internet connectivity is not RTK. No external receiver, corrected elevation, volume, or survey certification is added. Distances are horizontal estimates; route lines connect recorded positions, including gaps, and timestamp spans include pauses. Areas are local field estimates and totals can include overlapping polygons.

Native GPS/camera permissions, long-duration route tracking, battery restrictions and native share sheets require physical Android/iOS testing. The browser test did not obtain a device location. Offline data storage remains local IndexedDB; map tiles and live weather require connectivity. Form text/photos are not yet recovered after an application crash; geometry drafts are. Cloud sync, complete backup/restore and offline map packs remain future work.

## References checked

- [Trimble Access measure workflows](https://help.fieldsystems.trimble.com/trimble-access/latest/en/measure.htm): coded feature collection and map feedback.
- [W3C Geolocation](https://www.w3.org/TR/geolocation/): browser coordinates, timestamps and accuracy definitions.
- [Apple horizontalAccuracy](https://developer.apple.com/documentation/CoreLocation/CLLocation/horizontalAccuracy): uncertainty radius; no documented confidence percentage on this reference page.

Original source and README were saved before editing to `../FieldNote-before-20260907.zip`. The supplied directory had no Git repository.
