# Professional field-collection research

This review focuses on established field GIS products and official documentation. It is used as a requirements input, not as a reason to copy another product's interface.

## Repeated professional requirements

### Trustworthy positioning

- Accuracy must be identified as device/receiver metadata, not presented as a measurement calculated by the app.
- Manual placement must remain distinguishable from GNSS capture.
- Projects often need accuracy thresholds, warning/block policies, averaging and external GNSS support.
- Lines and areas need both manual vertices and streamed/walked capture.

Sources: [W3C Geolocation](https://www.w3.org/TR/geolocation/), [ArcGIS Field Maps configuration](https://doc.arcgis.com/en/field-maps/latest/prepare-maps/configure-the-map.htm), [Trimble TerraFlex settings](https://help.fieldsystems.trimble.com/trimble-terraflex/terraflex-settings.htm), [Fulcrum GPS accuracy](https://help.fulcrumapp.com/en/articles/77327-gps-data-accuracy).

### Project-defined forms

- Operatives should choose a feature type and see only the fields relevant to it.
- Required, read-only, conditional and repeatable fields are common.
- Photos are attachments/fields on a geographic feature, not a separate feature geometry.
- Inspections often revisit an existing asset and create a related record rather than duplicating the asset.

Sources: [ArcGIS Field Maps overview](https://doc.arcgis.com/en/field-maps/get-started/get-started.htm), [Trimble TerraFlex field types](https://help.fieldsystems.trimble.com/trimble-terraflex/template-field-types.htm), [Trimble TerraFlex collection](https://help.fieldsystems.trimble.com/trimble-terraflex/collecting-new-data.htm), [Mergin Maps documentation](https://merginmaps.com/docs/).

### Offline resilience

- Projects, forms, reference layers and attachments must be deliberately prepared for offline work.
- Partial tracks and unfinished work should survive interruption.
- Sync status and conflicts must be visible and recoverable.
- Offline basemap downloads require a provider and packaging workflow that explicitly permits them.

Sources: [Mergin Maps offline workflow](https://merginmaps.com/docs/field/offline-use/), [Fulcrum offline collection](https://help.fulcrumapp.com/en/articles/76979-can-i-still-collect-data-without-a-connection-to-the-internet), [Fulcrum GPS tracks](https://help.fulcrumapp.com/en/articles/13534210-collecting-gps-tracks-on-mobile), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).

### Efficient field editing

- Snapping, copying geometry/attributes, streaming, filtering, search and bulk review prevent repeated work.
- Draft status, needs-review status and assignments help supervisors distinguish collection from approval.
- Barcodes, signatures, rangefinders and external sensors are valuable in specialised workflows.

Sources: [ArcGIS Field Maps configuration](https://doc.arcgis.com/en/field-maps/latest/prepare-maps/configure-the-map.htm), [Trimble TerraFlex template fields](https://help.fieldsystems.trimble.com/trimble-terraflex/template-field-types.htm), [QField documentation](https://docs.qfield.org/).

## Implemented in this beta iteration

- Device accuracy terminology and 95% confidence labelling
- Manual/device/import source metadata
- Accuracy review threshold
- Project feature attachments with camera-first capture and geotags
- Basemap switching
- CRS-aware CSV, KML and zipped Shapefile imports
- Long-distance project/CRS warnings
- Multi-format GIS exports
- Simple mudmap and photo-rich printable report
- Interrupted capture recovery

## Prioritised production backlog

1. Configurable feature templates with required, conditional and repeatable fields
2. True offline map packages using a licensed vector/raster tile provider
3. Authentication, assignments, team sync and conflict resolution
4. Existing-asset inspection/related-record workflow
5. GPS averaging, configurable warn/block thresholds and receiver/fix metadata
6. Snapping, copy feature, vertex editing and geometry QA
7. Native background tracking, camera compression and attachment retry queues
8. Barcode/QR scanning, signatures, voice notes and sensor integrations
9. Full audit history, supervisor approval and retention policies
