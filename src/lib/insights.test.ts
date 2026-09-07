import { describe, expect, it } from 'vitest'
import { bearingDegrees, collectionMethod, geometryIssue, jobSummary, recordIssues, recordMetrics } from './insights'
import { distanceMetres, polygonAreaSquareMetres } from './geo'
import type { Coordinate, FieldRecord } from '../types'
const p = (latitude: number, longitude: number, timestamp = 0): Coordinate => ({ latitude, longitude, timestamp, source: 'device', accuracy: 5 })
const record: FieldRecord = { id: '1', projectId: 'p', mode: 'point', category: 'asset', label: 'A', notes: '', status: 'complete', coordinates: [p(0, 0)], attachments: [], operative: '', createdAt: '', updatedAt: '', syncStatus: 'local' }
describe('field calculations and quality checks', () => {
  it('computes cardinal bearings and handles identical positions', () => {
    expect(bearingDegrees(p(0, 0), p(1, 0))).toBe(0)
    expect(bearingDegrees(p(0, 0), p(0, 1))).toBe(90)
    expect(bearingDegrees(p(0, 0), p(-1, 0))).toBe(180)
    expect(bearingDegrees(p(0, 0), p(0, -1))).toBe(270)
    expect(bearingDegrees(p(0, 0), p(0, 0))).toBeNull()
  })
  it('rejects invalid coordinates, repeated vertices and zero-area polygons', () => {
    expect(geometryIssue('point', [p(91, 0)])).toBeTruthy()
    expect(geometryIssue('line', [p(0, 0), p(0, 0)])).toBeTruthy()
    expect(geometryIssue('area', [p(0, 0), p(0, 1), p(0, 2)])).toBeTruthy()
    expect(geometryIssue('area', [p(0,0),p(1,1),p(0,1),p(1,0)])).toContain('cross')
  })
  it('closes a perimeter exactly once and does not count areas as line length', () => {
    const coordinates = [p(0, 0), p(0, 0.001), p(0.001, 0)]
    const area = { ...record, mode: 'area' as const, coordinates }
    const open = recordMetrics(area)
    expect(open.perimeterMetres).toBeCloseTo(recordMetrics({ ...area, coordinates: [...coordinates, coordinates[0]] }).perimeterMetres!)
    expect(open.lengthMetres).toBeNull()
    expect(jobSummary([area]).lengthMetres).toBe(0)
  })
  it('handles small areas across the date line and antipodal distance', () => {
    const area = polygonAreaSquareMetres([p(0,179.999),p(0,-179.999),p(0.001,-179.999),p(0.001,179.999)])
    expect(area).toBeGreaterThan(24000)
    expect(area).toBeLessThan(25000)
    expect(Number.isFinite(distanceMetres(p(25, 30),p(-25,-150)))).toBe(true)
  })
  it('flags poor/manual positions independently of completion status', () => {
    expect(recordIssues({ ...record, coordinates: [{ ...p(0,0), accuracy: 50 }] })).toContain('Position estimate exceeds 10 m')
    const manual = { ...record, coordinates: [{ ...p(0,0), source: 'manual' as const }] }
    expect(jobSummary([manual]).review).toBe(1)
    expect(collectionMethod({ ...record, coordinates: [...record.coordinates, ...manual.coordinates] })).toBe('mixed')
  })
  it('only derives route duration from ordered device timestamps', () => {
    const route = { ...record, mode: 'route' as const, coordinates: [p(0,0,1000),p(0,1,61000)] }
    expect(recordMetrics(route).elapsedSeconds).toBe(60)
    expect(recordMetrics({ ...route, coordinates: [...route.coordinates].reverse() }).elapsedSeconds).toBeNull()
    expect(recordMetrics({ ...route, coordinates: route.coordinates.map(point => ({ ...point, source: 'imported' as const })) }).elapsedSeconds).toBeNull()
  })
})
