export type BasemapId = 'streets' | 'satellite' | 'light' | 'none'

export const BASEMAPS: Record<BasemapId, {
  id: BasemapId
  name: string
  description: string
  url?: string
  attribution?: string
  maxZoom?: number
  previewClass: string
}> = {
  streets: {
    id: 'streets',
    name: 'Streets',
    description: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    previewClass: 'basemap-streets',
  },
  satellite: {
    id: 'satellite',
    name: 'Satellite',
    description: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri and imagery contributors',
    maxZoom: 19,
    previewClass: 'basemap-satellite',
  },
  light: {
    id: 'light',
    name: 'Light',
    description: 'CARTO Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    previewClass: 'basemap-light',
  },
  none: {
    id: 'none',
    name: 'No basemap',
    description: 'Data only',
    previewClass: 'basemap-none',
  },
}
