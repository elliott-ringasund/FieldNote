import { describe, expect, it } from 'vitest'
import { transformToWgs84 } from './crs'

describe('coordinate reference transformation', () => {
  it('transforms Web Mercator into WGS 84', () => {
    const [longitude, latitude] = transformToWgs84(1_113_194.9079, 0, 'EPSG:3857')
    expect(longitude).toBeCloseTo(10, 5)
    expect(latitude).toBeCloseTo(0, 5)
  })

  it('blocks invalid WGS 84 ranges', () => {
    expect(() => transformToWgs84(500_000, 6_700_000, 'EPSG:4326')).toThrow(/valid WGS 84/)
  })
})
