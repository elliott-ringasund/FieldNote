import Papa from 'papaparse'
import { kml } from '@tmcw/togeojson'
import shp from 'shpjs'
import JSZip from 'jszip'
import type { FieldRecord } from '../types'
import { transformToWgs84 } from './crs'
import { distanceMetres } from './geo'

export type CsvRow = Record<string, string | number | boolean | null>
export type CsvPreview = { rows: CsvRow[]; columns: string[]; suggestedX: string; suggestedY: string }

export async function parseCsv(file: File): Promise<CsvPreview> {
  const text = await file.text()
  const result = Papa.parse<CsvRow>(text, { header: true, dynamicTyping: true, skipEmptyLines: 'greedy', transformHeader: (header) => header.trim() })
  if (result.errors.length && result.data.length === 0) throw new Error(result.errors[0].message)
  const columns = result.meta.fields ?? Object.keys(result.data[0] ?? {})
  const find = (patterns: RegExp[]) => columns.find((column) => patterns.some((pattern) => pattern.test(column.trim().toLowerCase()))) ?? ''
  const suggestedX = find([/^longitude$/, /^lon$/, /^lng$/, /^x$/, /^easting$/, /^east$/])
  const suggestedY = find([/^latitude$/, /^lat$/, /^y$/, /^northing$/, /^north$/])
  if (!columns.length || !result.data.length) throw new Error('The CSV does not contain any data rows.')
  return { rows: result.data, columns, suggestedX, suggestedY }
}

export async function parseKml(file: File): Promise<GeoJSON.FeatureCollection> {
  const document = new DOMParser().parseFromString(await file.text(), 'text/xml')
  if (document.querySelector('parsererror')) throw new Error('The KML file is not valid XML.')
  return kml(document) as GeoJSON.FeatureCollection
}

export async function inspectShapefileZip(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const names = Object.keys(zip.files)
  const hasShp = names.some((name) => name.toLowerCase().endsWith('.shp'))
  const hasDbf = names.some((name) => name.toLowerCase().endsWith('.dbf'))
  const hasPrj = names.some((name) => name.toLowerCase().endsWith('.prj'))
  if (!hasShp) throw new Error('The ZIP does not contain a .shp geometry file.')
  return { hasDbf, hasPrj, names }
}

export async function parseShapefile(file: File): Promise<{ collection: GeoJSON.FeatureCollection; hasPrj: boolean; hasDbf: boolean }> {
  const inspection = await inspectShapefileZip(file)
  const parsed = await shp(await file.arrayBuffer())
  const collections = Array.isArray(parsed) ? parsed : [parsed]
  return {
    collection: { type: 'FeatureCollection', features: collections.flatMap((collection) => collection.features) },
    hasPrj: inspection.hasPrj,
    hasDbf: inspection.hasDbf,
  }
}

function primitiveProperties(properties: Record<string, unknown> | null) {
  return Object.fromEntries(Object.entries(properties ?? {}).map(([key, value]) => [key, value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value as string | number | boolean | null : JSON.stringify(value)]))
}

function coordinatePair(position: GeoJSON.Position) {
  const [longitude, latitude] = position
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) throw new Error('At least one coordinate is outside the WGS 84 longitude/latitude range. The source CRS is missing or incorrect.')
  return { latitude, longitude, source: 'imported' as const, timestamp: Date.now() }
}

export function geoJsonToRecords(projectId: string, collection: GeoJSON.FeatureCollection, sourceName: string, sourceCrs = 'EPSG:4326'): FieldRecord[] {
  const records: FieldRecord[] = []
  const add = (feature: GeoJSON.Feature, geometry: Exclude<GeoJSON.Geometry, { type: 'GeometryCollection' }>, index: number) => {
    const properties = primitiveProperties(feature.properties)
    const labelValue = properties.name ?? properties.Name ?? properties.label ?? properties.Label ?? properties.id ?? properties.ID
    const base = {
      id: crypto.randomUUID(), projectId, category: String(properties.category ?? properties.type ?? `Imported ${geometry.type}`), label: String(labelValue ?? `${sourceName} ${index + 1}`), notes: String(properties.notes ?? properties.description ?? ''), status: 'needs-review' as const, attachments: [], operative: 'Imported data', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: 'local' as const, source: 'import' as const, sourceCrs, attributes: properties,
    }
    if (geometry.type === 'Point') records.push({ ...base, mode: 'point', coordinates: [coordinatePair(geometry.coordinates)] })
    if (geometry.type === 'LineString') records.push({ ...base, mode: 'line', coordinates: geometry.coordinates.map(coordinatePair) })
    if (geometry.type === 'Polygon') records.push({ ...base, mode: 'area', coordinates: geometry.coordinates[0].map(coordinatePair).filter((_, coordinateIndex, values) => coordinateIndex !== values.length - 1 || values.length === 1 || values[0].latitude !== values.at(-1)?.latitude || values[0].longitude !== values.at(-1)?.longitude) })
  }
  collection.features.forEach((feature, featureIndex) => {
    const geometry = feature.geometry
    if (!geometry) return
    if (geometry.type === 'Point' || geometry.type === 'LineString' || geometry.type === 'Polygon') add(feature, geometry, featureIndex)
    else if (geometry.type === 'MultiPoint') geometry.coordinates.forEach((coordinates, part) => add(feature, { type: 'Point', coordinates }, featureIndex + part))
    else if (geometry.type === 'MultiLineString') geometry.coordinates.forEach((coordinates, part) => add(feature, { type: 'LineString', coordinates }, featureIndex + part))
    else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach((coordinates, part) => add(feature, { type: 'Polygon', coordinates }, featureIndex + part))
  })
  return records
}

export function csvToRecords(projectId: string, preview: CsvPreview, xField: string, yField: string, sourceCrs: string, sourceName: string) {
  if (!xField || !yField || xField === yField) throw new Error('Choose different X/longitude and Y/latitude columns.')
  const features: GeoJSON.Feature[] = preview.rows.map((row, index) => {
    const x = Number(row[xField])
    const y = Number(row[yField])
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Row ${index + 2} has an invalid coordinate in ${xField} or ${yField}.`)
    const coordinates = transformToWgs84(x, y, sourceCrs)
    return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties: row }
  })
  return geoJsonToRecords(projectId, { type: 'FeatureCollection', features }, sourceName, sourceCrs)
}

export function projectDistanceWarning(imported: FieldRecord[], existing: FieldRecord[]) {
  const firstImported = imported[0]?.coordinates[0]
  const firstExisting = existing.flatMap((record) => record.coordinates)[0]
  if (!firstImported || !firstExisting) return null
  const distance = distanceMetres(firstImported, firstExisting)
  if (distance < 100_000) return null
  return `The imported data begins ${Math.round(distance / 1000).toLocaleString()} km from this project's existing records. This often indicates the wrong CRS or swapped X/Y columns.`
}
