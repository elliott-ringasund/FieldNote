import { describe, expect, it } from 'vitest'
import { distanceMetres, lineLengthMetres, minimumCoordinateCount, polygonAreaSquareMetres } from './geo'
import type { Coordinate } from '../types'

const coordinate = (latitude: number, longitude: number): Coordinate => ({ latitude, longitude, timestamp: 0 })

describe('geometry calculations', () => {
  it('calculates a known one-degree distance at the equator', () => {
    expect(distanceMetres(coordinate(0, 0), coordinate(0, 1))).toBeCloseTo(111_195, -1)
  })

  it('sums all segments in a line', () => {
    const length = lineLengthMetres([coordinate(0, 0), coordinate(0, 0.001), coordinate(0, 0.002)])
    expect(length).toBeGreaterThan(220)
    expect(length).toBeLessThan(224)
  })

  it('calculates a small polygon area', () => {
    const area = polygonAreaSquareMetres([
      coordinate(0, 0),
      coordinate(0, 0.001),
      coordinate(0.001, 0.001),
      coordinate(0.001, 0),
    ])
    expect(area).toBeGreaterThan(12_300)
    expect(area).toBeLessThan(12_500)
  })

  it('enforces geometry-specific minimum position counts', () => {
    expect(minimumCoordinateCount('point')).toBe(1)
    expect(minimumCoordinateCount('line')).toBe(2)
    expect(minimumCoordinateCount('area')).toBe(3)
    expect(minimumCoordinateCount('route')).toBe(2)
  })
})
