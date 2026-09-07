import type { Coordinate, FieldRecord } from '../types'
import { accuracyStats } from './accuracy'
import { distanceMetres, lineLengthMetres, minimumCoordinateCount, polygonAreaSquareMetres } from './geo'

export const REVIEW_THRESHOLD_METRES = 10
export function validPosition(p: Coordinate) {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180
}
export function collectionMethod(record: Pick<FieldRecord, 'coordinates' | 'source'>) {
  const sources = new Set(record.coordinates.map(p => p.source ?? (record.source === 'import' ? 'imported' : 'unknown')))
  return sources.size > 1 ? 'mixed' : [...sources][0] ?? 'unknown'
}
export function geometryIssue(mode: string, coordinates: Coordinate[]): string | null {
  if (coordinates.some(p => !validPosition(p))) return 'Invalid latitude or longitude'
  const distinct = new Set(coordinates.map(p => `${p.latitude},${p.longitude}`)).size
  if (distinct < minimumCoordinateCount(mode)) return `Needs ${minimumCoordinateCount(mode)} distinct positions`
  if (mode === 'point' && coordinates.length !== 1) return 'A point must have exactly one position'
  if (mode === 'area' && polygonCrossesItself(coordinates)) return 'Area edges cross; move or remove the crossing vertices'
  if (mode === 'area' && polygonAreaSquareMetres(coordinates) < 0.01) return 'Area has no measurable surface'
  return null
}
function polygonCrossesItself(coordinates: Coordinate[]) {
  if (coordinates.length < 4) return false
  const points = coordinates.map(p => ({ x: ((p.longitude - coordinates[0].longitude + 540) % 360) - 180, y: p.latitude - coordinates[0].latitude }))
  if (points[0].x === points.at(-1)!.x && points[0].y === points.at(-1)!.y) points.pop()
  const cross = (a: typeof points[number], b: typeof points[number], c: typeof points[number]) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue
      const c = points[j], d = points[(j + 1) % points.length]
      if (cross(a,b,c) * cross(a,b,d) < 0 && cross(c,d,a) * cross(c,d,b) < 0) return true
    }
  }
  return false
}
export function recordIssues(record: FieldRecord): string[] {
  const issues: string[] = []
  const geometry = geometryIssue(record.mode, record.coordinates)
  if (geometry) issues.push(geometry)
  const accuracy = accuracyStats(record.coordinates)
  if (accuracy && accuracy.maximum > REVIEW_THRESHOLD_METRES) issues.push('Position estimate exceeds 10 m')
  if (record.coordinates.some(p => p.source === 'manual')) issues.push('Contains manually placed positions')
  if (record.coordinates.some(p => p.source !== 'manual' && p.source !== 'imported' && (p.accuracy == null || !Number.isFinite(p.accuracy) || p.accuracy < 0))) issues.push('Position accuracy unavailable')
  if (record.status === 'needs-review') issues.push('Marked for review')
  if (record.status === 'follow-up') issues.push('Follow-up required')
  return issues
}
export function recordMetrics(record: FieldRecord) {
  const positions = record.coordinates
  const valid = !geometryIssue(record.mode, positions)
  const length = valid && record.mode !== 'point' ? lineLengthMetres(positions) : null
  const perimeter = valid && record.mode === 'area' ? length! + distanceMetres(positions[positions.length - 1], positions[0]) : null
  const area = valid && record.mode === 'area' ? polygonAreaSquareMetres(positions) : null
  // Timestamp span includes pauses. Imported/manual timestamps are not a measured duration.
  const deviceTimed = record.mode === 'route' && positions.length > 1 && positions.every((p, i) => p.source === 'device' && Number.isFinite(p.timestamp) && (i === 0 || p.timestamp > positions[i - 1].timestamp))
  const elapsedSeconds = deviceTimed ? (positions[positions.length - 1].timestamp - positions[0].timestamp) / 1000 : null
  return { lengthMetres: record.mode === 'area' ? null : length, perimeterMetres: perimeter, areaSquareMetres: area, elapsedSeconds }
}
export function jobSummary(records: FieldRecord[]) {
  return records.reduce((summary, record) => {
    const metrics = recordMetrics(record)
    summary.records++
    summary.photos += record.attachments.length
    summary.review += Number(recordIssues(record).length > 0)
    summary.lengthMetres += metrics.lengthMetres ?? 0
    summary.areaSquareMetres += metrics.areaSquareMetres ?? 0
    return summary
  }, { records: 0, photos: 0, review: 0, lengthMetres: 0, areaSquareMetres: 0 })
}
export function bearingDegrees(a: Coordinate, b: Coordinate): number | null {
  if (!validPosition(a) || !validPosition(b) || distanceMetres(a, b) < 0.01) return null
  const radians = Math.PI / 180
  const delta = (b.longitude - a.longitude) * radians
  const y = Math.sin(delta) * Math.cos(b.latitude * radians)
  const x = Math.cos(a.latitude * radians) * Math.sin(b.latitude * radians) - Math.sin(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.cos(delta)
  return (Math.atan2(y, x) / radians + 360) % 360
}
