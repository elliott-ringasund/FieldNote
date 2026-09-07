import type { Coordinate } from '../types'

const EARTH_RADIUS_METRES = 6_371_008.8

const radians = (degrees: number) => (degrees * Math.PI) / 180

export function distanceMetres(a: Coordinate, b: Coordinate): number {
  const latitudeDelta = radians(b.latitude - a.latitude)
  const longitudeDelta = radians(b.longitude - a.longitude)
  const latitudeA = radians(a.latitude)
  const latitudeB = radians(b.latitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))))
}

export function lineLengthMetres(coordinates: Coordinate[]): number {
  return coordinates.slice(1).reduce((total, coordinate, index) => {
    return total + distanceMetres(coordinates[index], coordinate)
  }, 0)
}

export function polygonAreaSquareMetres(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) return 0

  const meanLatitude = radians(
    coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) / coordinates.length,
  )
  // Use a local origin to avoid cancellation and unwrap the antimeridian.
  const origin = coordinates[0]
  const projected = coordinates.map((coordinate) => ({
    x: EARTH_RADIUS_METRES * radians(((coordinate.longitude - origin.longitude + 540) % 360) - 180) * Math.cos(meanLatitude),
    y: EARTH_RADIUS_METRES * radians(coordinate.latitude - origin.latitude),
  }))

  return Math.abs(
    projected.reduce((sum, point, index) => {
      const next = projected[(index + 1) % projected.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0) / 2,
  )
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`
}

export function formatArea(squareMetres: number): string {
  return squareMetres >= 10_000
    ? `${(squareMetres / 10_000).toFixed(2)} ha`
    : `${Math.round(squareMetres)} m²`
}

export function minimumCoordinateCount(mode: string): number {
  if (mode === 'line' || mode === 'route') return 2
  if (mode === 'area') return 3
  return 1
}
