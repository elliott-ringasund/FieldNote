# FieldNote beta

FieldNote is a native-packaged, mobile-first field data collection beta. It is designed around short, explicit collection sessions instead of passive employee tracking.

The desktop authoring companion — **FieldNote Studio**, a QGIS-style survey/map/report workspace in an app-simple shell — lives in [studio/](./studio/README.md) as its own standalone project (`cd studio && npm install && npm run dev`).

## Repository layout

```text
FieldNote/
├── src/              Mobile app source and tests
├── public/           Web manifest and browser assets
├── assets/           Source artwork for native asset generation
├── icons/            Generated web/PWA icons
├── android/          Native Android wrapper
├── ios/              Native iOS wrapper
├── studio/           Desktop GIS authoring companion
└── docs/             Product research and verification references
```

Generated dependencies and build output (`node_modules/` and `dist/`) stay beside the app that owns them and are excluded from source control.

## September 2026 field workflow update

The phone app now includes job quality summaries, a distance/bearing tool, condition and priority fields, arbitrary named observations, photo captions, and a recommended handover ZIP. The ZIP includes spreadsheets, GeoJSON, individual position metadata, linked photos, original JSON and a plain-language guide. Geometry edits preserve previous coordinates in an audit history.

See [the change and verification notes](docs/FIELD_WORKFLOW_UPDATE.md) for details and remaining platform boundaries. This update targets `src/`, the mobile app; the standalone `studio/` companion was not redesigned.

## Included in this beta

- Project creation and project-scoped records
- QGIS-style project layer tree with groups, active layers, visibility, ordering, locking and layer-level symbology
- Layer-aware feature review with searchable custom attributes and per-feature style overrides
- Point, line, area and optional route modes
- Provider-reported horizontal accuracy with provider reference preserved (browser 95%, Android 68%, or unspecified); legacy estimates remain unchanged
- A 10 m review threshold that flags questionable records without inventing precision
- Manual map placement when GPS is unavailable or a record needs office adjustment
- Post-save geometry editing with draggable positions and tap-to-add vertices
- Walked route tracking in the foreground, while the screen is locked, or while another app is open
- Vertex undo, route pause/resume and geometry validation
- Labels, categories, notes, status and multiple feature image attachments
- Camera-first capture on phones, with image capture time and position metadata
- Automatic timestamps and collection metadata
- Distance and approximate area calculations
- Searchable, filterable record history
- Streets, satellite, light and data-only basemap choices
- CRS-aware CSV, KML and zipped Shapefile import with blocking validation and distance warnings
- GeoJSON, CSV, KML and zipped Shapefile export
- Configurable SVG mudmaps with street/satellite/light basemaps, layer visibility, colours, symbols, labels, scale, grid, legend and north arrow
- Printable/PDF-style reports with images
- Recovery of unfinished geometry/route drafts after interruption
- IndexedDB persistence for projects, geometry and images
- Native Android and iOS Capacitor projects with app icons, splash screens and native GPS/camera permission handling
- A PWA build remains available for development and desktop access
- Clear online/offline and local-save status

## Run locally

```powershell
npm install
npm run dev
```

Then open the Vite URL. The app includes a starter project and two sample records so the map and record views are meaningful immediately.

Run the verification suite with:

```powershell
npm test
npm run lint
npm run build
```

## Run as a native phone app

The `android/` and `ios/` directories are real native application projects. Capacitor packages the built React interface inside an app binary and connects it to the native GPS and camera APIs; the installed app has no browser address bar or browser navigation.

Synchronise application changes into both native projects with:

```powershell
npm run native:sync
```

### Android

Install Android Studio and its Android SDK, enable USB debugging on the phone, connect it by USB, then run:

```powershell
npm run native:android
```

Select the connected phone in Android Studio and press Run. A signed Android App Bundle is required later for Google Play distribution.

### iPhone

iPhone builds require macOS, Xcode and an Apple signing team. On the Mac, run:

```bash
npm run native:ios
```

Select the connected iPhone in Xcode, set the signing team and press Run. TestFlight distribution requires an Apple Developer account.

## Browser development boundary

Browser geolocation generally requires a secure context. `localhost` is treated as secure on the development computer, but a plain `http://<computer-ip>` address may not receive location access on a phone. Deploy the beta to an HTTPS preview host or use an HTTPS development tunnel for real device GPS and PWA installation testing.

The app stores beta data in that browser's IndexedDB. Clearing site data removes it. Export important work regularly until server synchronisation and full-device backup are implemented.

## Accuracy and platform boundaries

- Phone GPS is appropriate for general field mapping, not cadastral, engineering or other survey-grade work.
- Each device-derived position retains the browser-reported accuracy, timestamp, altitude, heading and speed when available. Manual and imported coordinates never receive invented accuracy values.
- Area is calculated in a local equirectangular projection and is suitable for basic field estimates, not certified measurement.
- Native route mode uses a dedicated background-location service. Android displays a persistent FieldNote tracking notification; iOS displays the system background-location indicator. Starting, pausing and finishing tracking always remains an explicit operative action.
- The PWA shell and collected data work offline. OpenStreetMap tiles are not downloaded as offline map packs; production offline basemaps require a licensed provider and an explicit download workflow.

## Architecture

- React and TypeScript for the application and domain model
- One shared project model for field features, layers, groups, attributes and deliverables
- Leaflet/React Leaflet for mapping and geometry display
- IndexedDB through `idb` for durable device storage
- Capacitor for native Android/iOS packaging, permissions, GPS and camera access
- Vite PWA/Workbox for development and optional desktop installation
- Pure, tested geometry helpers for distance, area and minimum vertex rules

The data model keeps projects, records, coordinates and attachments separate enough to add a PostGIS-backed sync API and native mobile wrapper without redesigning field records.

## Next production milestones

1. Full device backup/restore
2. Authentication, teams, assignments and PostGIS synchronisation
3. Configurable project forms and required attributes
4. True offline map-region downloads using a licensed tile source
5. Long-duration field testing across phone models and battery-management modes
6. Conflict resolution, audit trails, supervisor review and data retention controls
7. External Bluetooth GNSS/RTK receiver support

See [docs/PRODUCT_RESEARCH.md](./docs/PRODUCT_RESEARCH.md) for the professional field-workflow patterns informing this beta and the resulting product backlog.
