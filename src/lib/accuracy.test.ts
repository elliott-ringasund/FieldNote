import { describe, expect, it } from 'vitest'
import { accuracyQuality, accuracyStats, formatAccuracy, nativeAccuracyTo95 } from './accuracy'

describe('device accuracy metadata', () => {
  it('uses honest field quality bands', () => {
    expect(accuracyQuality(2).quality).toBe('excellent')
    expect(accuracyQuality(7).quality).toBe('good')
    expect(accuracyQuality(15).quality).toBe('fair')
    expect(accuracyQuality(35).quality).toBe('poor')
  })

  it('excludes manually placed positions from device statistics', () => {
    const stats = accuracyStats([
      { latitude: 0, longitude: 0, accuracy: 3, source: 'device', timestamp: 0 },
      { latitude: 0, longitude: 0, accuracy: 999, source: 'manual', timestamp: 0 },
      { latitude: 0, longitude: 0, accuracy: 7, source: 'device', timestamp: 0 },
    ])
    expect(stats).toMatchObject({ minimum: 3, maximum: 7, mean: 5, count: 2 })
    expect(formatAccuracy(stats?.maximum)).toBe('±7.0 m estimate')
  })

  it('normalises native 68% accuracy radii to the app 95% convention', () => {
    expect(nativeAccuracyTo95(5)).toBeCloseTo(8.1)
    expect(nativeAccuracyTo95(null)).toBeUndefined()
  })
})
