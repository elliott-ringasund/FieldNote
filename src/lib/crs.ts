import proj4 from 'proj4'

proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs')
proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs +type=crs')
proj4.defs('EPSG:7855', '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs +type=crs')
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs +type=crs')

export const CRS_OPTIONS = [
  { code: 'EPSG:4326', label: 'WGS 84 — longitude / latitude' },
  { code: 'EPSG:3857', label: 'Web Mercator' },
  { code: 'EPSG:25832', label: 'ETRS89 / UTM zone 32N' },
  { code: 'EPSG:25833', label: 'ETRS89 / UTM zone 33N' },
  { code: 'EPSG:32632', label: 'WGS 84 / UTM zone 32N' },
  { code: 'EPSG:32633', label: 'WGS 84 / UTM zone 33N' },
  { code: 'EPSG:7855', label: 'GDA2020 / MGA zone 55' },
  { code: 'EPSG:32755', label: 'WGS 84 / UTM zone 55S' },
  { code: 'EPSG:27700', label: 'OSGB36 / British National Grid' },
] as const

export function transformToWgs84(x: number, y: number, sourceCrs: string): [number, number] {
  const [longitude, latitude] = sourceCrs === 'EPSG:4326' ? [x, y] : proj4(sourceCrs, 'EPSG:4326', [x, y])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error(`Coordinates do not produce a valid WGS 84 position using ${sourceCrs}. Check the source coordinate system and X/Y column order.`)
  }
  return [longitude, latitude]
}

export function looksProjected(x: number, y: number) {
  return Math.abs(x) > 180 || Math.abs(y) > 90
}
