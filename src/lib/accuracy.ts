import type { Coordinate } from '../types'

export type AccuracyQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

// Legacy conversion helper, retained for compatibility tests only. New readings
// preserve the provider radius and reference without conversion.
export function nativeAccuracyTo95(accuracy: number | null | undefined) {
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy * 1.62 : undefined
}

export function accuracyQuality(accuracy?: number): { quality: AccuracyQuality; label: string } {
  if (accuracy === undefined || (!Number.isFinite(accuracy) || accuracy < 0)) return { quality: 'unknown', label: 'No device estimate' }
  if (accuracy <= 3) return { quality: 'excellent', label: 'Excellent' }
  if (accuracy <= 8) return { quality: 'good', label: 'Good' }
  if (accuracy <= 20) return { quality: 'fair', label: 'Fair' }
  return { quality: 'poor', label: 'Poor' }
}

export function accuracyStats(coordinates: Coordinate[]) {
  const values = coordinates
    .filter((coordinate) => coordinate.source !== 'manual' && coordinate.source !== 'imported')
    .map((coordinate) => coordinate.accuracy)
    .filter((accuracy): accuracy is number => typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0)
  if (values.length === 0) return null
  return {
    minimum: values.reduce((min, value) => Math.min(min, value), Infinity),
    maximum: values.reduce((max, value) => Math.max(max, value), -Infinity),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    count: values.length,
  }
}

export function formatAccuracy(accuracy?: number) {
  return accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0 ? 'No device estimate' : `±${accuracy < 10 ? accuracy.toFixed(1) : Math.round(accuracy)} m estimate`
}
