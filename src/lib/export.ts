import { zip as zipShapefile } from '@mapbox/shp-write'

import JSZip from 'jszip'

import { collectionMethod, geometryIssue, recordIssues, recordMetrics, jobSummary } from './insights'

import { accuracyStats } from './accuracy'

import type { Coordinate, FieldRecord, Project } from '../types'

import { deliverFile, type FileAction } from './nativeShare'



type GeoJsonGeometry =

  | { type: 'Point'; coordinates: [number, number] }

  | { type: 'LineString'; coordinates: [number, number][] }

  | { type: 'Polygon'; coordinates: [number, number][][] }



const pair = (coordinate: Coordinate): [number, number] => [coordinate.longitude, coordinate.latitude]

export const projectSlug = (project: Project) => `${project.code}-${project.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fieldnote-job'

const xml = (value: unknown) => String(value ?? '').replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!)



function geometry(record: FieldRecord): GeoJsonGeometry | null {

  if (geometryIssue(record.mode, record.coordinates)) return null

  if (record.mode === 'area') {

    const ring = record.coordinates.map(pair)

    const first = ring[0]

    const last = ring.at(-1)

    if (first[0] !== last?.[0] || first[1] !== last?.[1]) ring.push(first)

    return { type: 'Polygon', coordinates: [ring] }

  }

  if (record.mode === 'line' || record.mode === 'route') return { type: 'LineString', coordinates: record.coordinates.map(pair) }

  return { type: 'Point', coordinates: pair(record.coordinates[0]) }

}



export function recordsToFeatureCollection(project: Project, records: FieldRecord[]) {

  return {

    type: 'FeatureCollection' as const,

    name: `${project.code} ${project.name}`,

    generatedAt: new Date().toISOString(),

    features: records.filter(record => record.projectId === project.id).flatMap((record) => {

      const recordGeometry = geometry(record)

      if (!recordGeometry) return []

      const accuracy = accuracyStats(record.coordinates)

      return [{

        type: 'Feature' as const,

        id: record.id,

        geometry: recordGeometry,

        properties: {

          ...record.attributes,

          attributes: record.attributes ?? {},

          project_id: project.id,

          layer_id: record.layerId ?? null,

          layer_name: project.layers?.find(layer => layer.id === record.layerId)?.name ?? null,

          project_code: project.code,

          mode: record.mode,

          category: record.category,

          label: record.label,

          notes: record.notes,

          status: record.status,

          operative: record.operative,

          created_at: record.createdAt,

          updated_at: record.updatedAt,

          position_count: record.coordinates.length,

          accuracy_min_m: accuracy?.minimum ?? null,

          accuracy_max_m: accuracy?.maximum ?? null,

          accuracy_mean_m: accuracy?.mean ?? null,

          accuracy_confidence: accuracy ? 'See position_metadata for provider reference; legacy values may be converted estimates' : null,

          collection_method: collectionMethod(record),

          source_crs: record.sourceCrs ?? 'EPSG:4326',

          attachment_count: record.attachments.length,

          attachment_names: record.attachments.map((attachment) => attachment.name),

          position_metadata: record.coordinates,

          length_m: recordMetrics(record).lengthMetres,

          perimeter_m: recordMetrics(record).perimeterMetres,

          area_m2: recordMetrics(record).areaSquareMetres,

          review_reasons: recordIssues(record),

        },

      }]

    }),

  }

}



export function downloadBlob(blob: Blob, filename: string, action: FileAction = 'save') {

  return deliverFile(blob, filename, action)

}



export function downloadGeoJson(project: Project, records: FieldRecord[], action: FileAction = 'save') {

  return downloadBlob(new Blob([JSON.stringify(recordsToFeatureCollection(project, records), null, 2)], { type: 'application/geo+json' }), `${projectSlug(project)}.geojson`, action)

}



function csvCell(value: unknown) {

  const raw = String(value ?? '')

  // Prevent spreadsheet formulas in user-entered text; keep numeric values numeric.

  const text = typeof value === 'string' && /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text

}



function wkt(record: FieldRecord) {

  const coordinates = record.coordinates.map((coordinate) => `${coordinate.longitude} ${coordinate.latitude}`)

  if (record.mode === 'point') return `POINT (${coordinates[0]})`

  if (record.mode === 'area') return `POLYGON ((${(coordinates.at(-1) === coordinates[0] ? coordinates : [...coordinates, coordinates[0]]).join(', ')}))`

  return `LINESTRING (${coordinates.join(', ')})`

}



export function recordsToCsv(project: Project, records: FieldRecord[]) {

  const scoped = records.filter(record => record.projectId === project.id)

  const attributes = [...new Set(scoped.flatMap(record => Object.keys(record.attributes ?? {})))].sort()

  const headers = ['id', 'project_code', 'layer', 'geometry_type', 'category', 'label', 'notes', 'status', 'operative', 'created_at', 'accuracy_max_m', 'image_count', 'longitude', 'latitude', 'geometry_wkt', 'collection_method', 'length_m', 'perimeter_m', 'area_m2', 'elapsed_seconds_including_pauses', 'review_reasons', ...attributes.map(key => `attribute: ${key}`)]

  const rows = scoped.map(record => {

    const accuracy = accuracyStats(record.coordinates)

    const first = record.coordinates[0]

    const metrics = recordMetrics(record)

    return [record.id, project.code, project.layers?.find(layer => layer.id === record.layerId)?.name ?? '', record.mode, record.category, record.label, record.notes, record.status, record.operative, record.createdAt, accuracy?.maximum ?? '', record.attachments.length, first?.longitude ?? '', first?.latitude ?? '', geometryIssue(record.mode, record.coordinates) ? '' : wkt(record), collectionMethod(record), metrics.lengthMetres, metrics.perimeterMetres, metrics.areaSquareMetres, metrics.elapsedSeconds, recordIssues(record).join('; '), ...attributes.map(key => record.attributes?.[key])]

  })

  return csvTable([headers, ...rows])

}

export function csvTable(rows: unknown[][]) { return rows.map(row => row.map(csvCell).join(',')).join('\r\n') }

export function downloadCsv(project: Project, records: FieldRecord[], action: FileAction = 'save') {

  return downloadBlob(new Blob(['\uFEFF' + recordsToCsv(project, records)], { type: 'text/csv;charset=utf-8' }), `${projectSlug(project)}.csv`, action)

}



function kmlCoordinates(record: FieldRecord) {

  return record.coordinates.map((coordinate) => coordinate.longitude + ',' + coordinate.latitude + (coordinate.altitude != null ? ',' + coordinate.altitude : '')).join(' ')

}



export function downloadKml(project: Project, records: FieldRecord[], action: FileAction = 'save') {

  const placemarks = records.filter(record => record.projectId === project.id && !geometryIssue(record.mode, record.coordinates)).map((record) => {

    const coordinates = kmlCoordinates(record)

    const first = record.coordinates[0]

    const geometryXml = record.mode === 'point'

      ? `<Point><coordinates>${coordinates}</coordinates></Point>`

      : record.mode === 'area'

        ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates} ${first ? first.longitude + ',' + first.latitude : ''}</coordinates></LinearRing></outerBoundaryIs></Polygon>`

        : `<LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString>`

    const description = [record.category, record.notes, 'Status: ' + record.status].join('\n')

    return `<Placemark><name>${xml(record.label)}</name><description>${xml(description)}</description><ExtendedData><Data name="id"><value>${xml(record.id)}</value></Data><Data name="operative"><value>${xml(record.operative)}</value></Data><Data name="created_at"><value>${xml(record.createdAt)}</value></Data></ExtendedData>${geometryXml}</Placemark>`

  }).join('')

  const content = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(project.code + ' ' + project.name)}</name>${placemarks}</Document></kml>`

  return downloadBlob(new Blob([content], { type: 'application/vnd.google-earth.kml+xml' }), `${projectSlug(project)}.kml`, action)

}



export async function downloadShapefile(project: Project, records: FieldRecord[], action: FileAction = 'save') {

  const collection = recordsToFeatureCollection(project, records)

  const compact: GeoJSON.FeatureCollection = {

    type: 'FeatureCollection',

    features: collection.features.map((feature) => ({

      type: 'Feature',

      geometry: feature.geometry,

      properties: {

        ID: String(feature.id),

        PRJ_CODE: project.code,

        GEOM_TYPE: feature.properties.mode,

        CATEGORY: feature.properties.category,

        LABEL: feature.properties.label,

        STATUS: feature.properties.status,

        OPERATIVE: feature.properties.operative,

        CREATED: feature.properties.created_at,

        ACC_MAX_M: feature.properties.accuracy_max_m,

        IMG_COUNT: feature.properties.attachment_count,

      },

    })),

  }

  const blob = await zipShapefile<'blob'>(compact, {

    outputType: 'blob',

    compression: 'DEFLATE',

    folder: projectSlug(project),

    filename: projectSlug(project),

    types: { point: 'points', line: 'lines', polygon: 'areas' },

  })

  return downloadBlob(blob, `${projectSlug(project)}-shapefile.zip`, action)

}



/** A handover package, with original observations retained separately from derived values. */

export async function buildHandover(project: Project, records: FieldRecord[]) {

  const scoped = records.filter(record => record.projectId === project.id)

  const zip = new JSZip()

  zip.file('records.csv', '\uFEFF' + recordsToCsv(project, scoped))

  zip.file('map.geojson', JSON.stringify(recordsToFeatureCollection(project, scoped), null, 2))

  zip.file('original-data.json', JSON.stringify({ schema: 'fieldnote-handover', version: 1, exportedAt: new Date().toISOString(), project, records: scoped }, null, 2))

  zip.file('positions.csv', '\uFEFF' + csvTable([

    ['record_id', 'label', 'position_number', 'latitude_deg', 'longitude_deg', 'horizontal_accuracy_m', 'accuracy_reference', 'altitude_m_provider_datum', 'vertical_accuracy_m', 'heading_deg', 'speed_m_s', 'timestamp_utc', 'source'],

    ...scoped.flatMap(record => record.coordinates.map((p, index) => [record.id, record.label, index + 1, p.latitude, p.longitude, p.accuracy, p.accuracyReference ?? 'legacy-unspecified', p.altitude, p.altitudeAccuracy, p.heading, p.speed, Number.isFinite(p.timestamp) ? new Date(p.timestamp).toISOString() : '', p.source ?? 'unknown'])),

  ]))

  const photoRows: unknown[][] = [['record_id', 'label', 'file', 'original_name', 'caption', 'added_or_captured_at', 'source']]

  for (const [recordIndex, record] of scoped.entries()) {

    for (const [photoIndex, photo] of record.attachments.entries()) {

      const match = /^data:image\/(png|jpeg|jpg|webp|gif|heic|heif);base64,([\s\S]+)$/i.exec(photo.dataUrl)

      if (!match) throw new Error(`Cannot package image “${photo.name}”. The original image data is not a supported image.`)

      const filename = `photos/${recordIndex + 1}-${photoIndex + 1}.${match[1].toLowerCase()}`

      zip.file(filename, match[2], { base64: true })

      photoRows.push([record.id, record.label, filename, photo.name, photo.caption, photo.capturedAt, photo.source])

    }

  }

  zip.file('photos.csv', '\uFEFF' + csvTable(photoRows))

  const summary = jobSummary(scoped)

  zip.file('START-HERE.txt', `FIELDNOTE — ${project.code} / ${project.name}



${summary.records} records | ${summary.photos} photos | ${summary.review} records to check



OPEN THESE FILES

records.csv — Open in Excel or another spreadsheet. One row per feature, with custom fields and review reasons.

positions.csv — Every original vertex, its time, source and available sensor readings. Position numbers start at 1.

map.geojson — Open in QGIS or another GIS. Invalid geometries are omitted here but retained in the tables and original data.

photos/ + photos.csv — Images and a table linking each image to its record and caption.

original-data.json — Complete project and records, including embedded photos. Keep for data preservation; automatic restore is not yet supported.



UNDERSTANDING THE DATA

Coordinates are WGS 84 degrees. Longitude is east/west; latitude is north/south. In records.csv these identify the FIRST position, not the centre of a line or area. GeoJSON and WKT use longitude, latitude order.

Distances and perimeters are approximate horizontal metres; areas are square metres. Area totals add individual features and may double-count overlaps. Route duration is the timestamp span INCLUDING pauses, not moving time. No volume, certified elevation, or survey-grade precision is inferred.

Accuracy is the provider's uncertainty radius, not a guarantee. See accuracy_reference: browser-95 means browser-reported 95%; android-68 means Android-reported 68%; provider means unspecified confidence. Older observations may contain converted 95% estimates and are labelled legacy-unspecified. These estimates are not directly comparable across providers. Blank values mean unavailable, never zero.

Phone location may combine GNSS, Wi-Fi and cellular signals; the app cannot identify the exact source. Internet improves map/weather availability but does not turn a phone into an RTK receiver.

Altitude uses the provider's datum and is not a verified site level. Library-photo timestamps may describe when an image was added; do not assume they are EXIF capture times. Legacy photo geotags may reflect the device location when added.

A review reason is independent of the operator's completion status. The 10 m check is a workflow threshold, not a certified tolerance.

User text beginning with formula characters is prefixed with an apostrophe in CSV for safe spreadsheet opening. Original values remain in original-data.json.

`)

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })

}

export async function downloadHandover(project: Project, records: FieldRecord[], action: FileAction = 'save') {

  return downloadBlob(await buildHandover(project, records), `${projectSlug(project)}-handover.zip`, action)

}

