import { downloadBlob, projectSlug } from './export'
import type { FileAction } from './nativeShare'
import { distanceMetres, formatArea, formatDistance, lineLengthMetres, polygonAreaSquareMetres } from './geo'
import { BASEMAPS, type BasemapId } from './basemaps'
import type { Attachment, FieldRecord, Project, WeatherSnapshot } from '../types'

const escapeText = (value: unknown) => String(value ?? '').replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' })[character]!)

function niceScale(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  return (fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1) * power
}

export type MudmapPointSymbol = 'circle' | 'square' | 'triangle' | 'pin'
export type MudmapLabelMode = 'number' | 'label' | 'both' | 'none'
export type MapExtent = { minLongitude: number; maxLongitude: number; minLatitude: number; maxLatitude: number }
export type MudmapPageSpec = { id: string; title: string; recordIds: string[]; extentPaddingPercent: number; extent?: MapExtent }

export type MudmapOptions = {
  basemap: BasemapId
  backgroundColor: string
  pointColor: string
  lineColor: string
  areaColor: string
  routeColor: string
  labelColor: string
  pointSymbol: MudmapPointSymbol
  labelMode: MudmapLabelMode
  showPoints: boolean
  showLines: boolean
  showAreas: boolean
  showRoutes: boolean
  showGrid: boolean
  showScale: boolean
  showNorthArrow: boolean
  showLegend: boolean
  showWeather: boolean
  extentPaddingPercent: number
}

export const DEFAULT_MUDMAP_OPTIONS: MudmapOptions = {
  basemap: 'light',
  backgroundColor: '#f8faf7',
  pointColor: '#31c4d6',
  lineColor: '#d49324',
  areaColor: '#d49324',
  routeColor: '#235d52',
  labelColor: '#18312d',
  pointSymbol: 'pin',
  labelMode: 'both',
  showPoints: true,
  showLines: true,
  showAreas: true,
  showRoutes: true,
  showGrid: false,
  showScale: true,
  showNorthArrow: true,
  showLegend: true,
  showWeather: true,
  extentPaddingPercent: 15,
}

const tileLongitude = (x: number, zoom: number) => x / 2 ** zoom * 360 - 180
const tileLatitude = (y: number, zoom: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** zoom))) * 180 / Math.PI
const longitudeTile = (longitude: number, zoom: number) => (longitude + 180) / 360 * 2 ** zoom
const latitudeTile = (latitude: number, zoom: number) => {
  const radians = latitude * Math.PI / 180
  return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * 2 ** zoom
}

function tileUrl(basemap: BasemapId, zoom: number, tileX: number, tileY: number) {
  const template = BASEMAPS[basemap]?.url
  if (!template) return ''
  return template.replace('{s}', 'a').replace('{r}', '').replace('{z}', String(zoom)).replace('{x}', String(tileX)).replace('{y}', String(tileY))
}

function chooseTileZoom(minLon: number, maxLon: number, minLat: number, maxLat: number) {
  for (let zoom = 19; zoom >= 2; zoom -= 1) {
    const columns = Math.floor(longitudeTile(maxLon, zoom)) - Math.floor(longitudeTile(minLon, zoom)) + 1
    const rows = Math.floor(latitudeTile(minLat, zoom)) - Math.floor(latitudeTile(maxLat, zoom)) + 1
    if (columns * rows <= 24) return zoom
  }
  return 2
}

function pointShape(symbol: MudmapPointSymbol, x: number, y: number, color: string, outline = '#ffffff', outlineWidth = 2, recordId = '') {
  const common = `data-record-id="${escapeText(recordId)}" fill="${color}" stroke="${outline}" stroke-width="${outlineWidth}" class="point report-shape"`
  if (symbol === 'square') return `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" ${common}/>`
  if (symbol === 'triangle') return `<path d="M${x} ${y - 9}L${x + 9} ${y + 8}H${x - 9}Z" ${common}/>`
  if (symbol === 'pin') return `<path d="M${x} ${y + 11}C${x - 3} ${y + 6},${x - 9} ${y + 1},${x - 9} ${y - 5}A9 9 0 1 1 ${x + 9} ${y - 5}C${x + 9} ${y + 1},${x + 3} ${y + 6},${x} ${y + 11}Z" ${common}/><circle cx="${x}" cy="${y - 5}" r="3" fill="white" pointer-events="none"/>`
  return `<circle cx="${x}" cy="${y}" r="8" ${common}/>`
}

export function renderMudmapSvg(project: Project, records: FieldRecord[], width = 1100, height = 720, suppliedOptions: MudmapOptions = DEFAULT_MUDMAP_OPTIONS, suppliedExtent?: MapExtent, weather?: WeatherSnapshot | null) {
  const options = { ...DEFAULT_MUDMAP_OPTIONS, ...suppliedOptions }
  const all = records.flatMap((record) => record.coordinates)
  if (!all.length) throw new Error('There is no geometry to map.')
  let minLon = suppliedExtent?.minLongitude ?? Math.min(...all.map((coordinate) => coordinate.longitude))
  let maxLon = suppliedExtent?.maxLongitude ?? Math.max(...all.map((coordinate) => coordinate.longitude))
  let minLat = suppliedExtent?.minLatitude ?? Math.min(...all.map((coordinate) => coordinate.latitude))
  let maxLat = suppliedExtent?.maxLatitude ?? Math.max(...all.map((coordinate) => coordinate.latitude))
  if (minLon === maxLon) { minLon -= .0005; maxLon += .0005 }
  if (minLat === maxLat) { minLat -= .0005; maxLat += .0005 }
  const pad = 72
  const mapWidth = width - pad * 2
  const mapHeight = height - pad * 2 - 42
  const centreLon = (minLon + maxLon) / 2
  const centreLat = (minLat + maxLat) / 2
  const cosine = Math.max(.15, Math.cos(centreLat * Math.PI / 180))
  let longitudeSpan = maxLon - minLon
  let latitudeSpan = maxLat - minLat
  const targetRatio = mapWidth / mapHeight
  const groundRatio = longitudeSpan * cosine / latitudeSpan
  if (groundRatio > targetRatio) latitudeSpan = longitudeSpan * cosine / targetRatio
  else longitudeSpan = latitudeSpan * targetRatio / cosine
  const frameFactor = suppliedExtent ? 1 : 1 + Math.max(0, Math.min(300, options.extentPaddingPercent)) / 50
  longitudeSpan *= frameFactor
  latitudeSpan *= frameFactor
  minLon = centreLon - longitudeSpan / 2
  maxLon = centreLon + longitudeSpan / 2
  minLat = centreLat - latitudeSpan / 2
  maxLat = centreLat + latitudeSpan / 2
  const x = (longitude: number) => pad + ((longitude - minLon) / (maxLon - minLon)) * mapWidth
  const y = (latitude: number) => pad + ((maxLat - latitude) / (maxLat - minLat)) * mapHeight
  const grid = Array.from({ length: 9 }, (_, index) =>
    `<line x1="${pad + index * mapWidth / 8}" y1="${pad}" x2="${pad + index * mapWidth / 8}" y2="${pad + mapHeight}"/><line x1="${pad}" y1="${pad + index * mapHeight / 8}" x2="${pad + mapWidth}" y2="${pad + index * mapHeight / 8}"/>`
  ).join('')
  const basemapTiles = (() => {
    if (options.basemap === 'none') return ''
    const zoom = chooseTileZoom(minLon, maxLon, minLat, maxLat)
    const minTileX = Math.floor(longitudeTile(minLon, zoom))
    const maxTileX = Math.floor(longitudeTile(maxLon, zoom))
    const minTileY = Math.floor(latitudeTile(maxLat, zoom))
    const maxTileY = Math.floor(latitudeTile(minLat, zoom))
    const images: string[] = []
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
        const url = tileUrl(options.basemap, zoom, tileX, tileY)
        if (!url) continue
        const west = tileLongitude(tileX, zoom)
        const east = tileLongitude(tileX + 1, zoom)
        const north = tileLatitude(tileY, zoom)
        const south = tileLatitude(tileY + 1, zoom)
        images.push(`<image href="${escapeText(url)}" x="${x(west)}" y="${y(north)}" width="${x(east) - x(west)}" height="${y(south) - y(north)}" preserveAspectRatio="none"/>`)
      }
    }
    return images.join('')
  })()
  const labels: string[] = []
  const labelBoxes: Array<{ left: number; right: number; top: number; bottom: number }> = []
  const visibleRecords = records.filter((record) => record.mode === 'point' ? options.showPoints : record.mode === 'line' ? options.showLines : record.mode === 'area' ? options.showAreas : options.showRoutes)
  const shapes = visibleRecords.map((record) => {
    const index = records.findIndex((candidate) => candidate.id === record.id)
    const points = record.coordinates.map((coordinate) => `${x(coordinate.longitude).toFixed(1)},${y(coordinate.latitude).toFixed(1)}`).join(' ')
    const first = record.coordinates[0]
    const label = options.labelMode === 'number' ? String(index + 1) : options.labelMode === 'label' ? record.label : `${index + 1} · ${record.label}`
    if (options.labelMode !== 'none' && record.style?.showLabel !== false) {
      const anchorX = x(first.longitude)
      const anchorY = y(first.latitude)
      const labelWidth = Math.max(28, label.length * 7.4)
      const candidates = [[record.style?.labelOffsetX ?? 16, record.style?.labelOffsetY ?? -14], [16, 25], [-labelWidth - 16, -14], [-labelWidth - 16, 25], [16, 44]]
      const offset = candidates.find(([dx, dy]) => {
        const box = { left: anchorX + dx, right: anchorX + dx + labelWidth, top: anchorY + dy - 14, bottom: anchorY + dy + 3 }
        return !labelBoxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)
      }) ?? candidates[candidates.length - 1]
      labelBoxes.push({ left: anchorX + offset[0], right: anchorX + offset[0] + labelWidth, top: anchorY + offset[1] - 14, bottom: anchorY + offset[1] + 3 })
      labels.push(`<text x="${anchorX + offset[0]}" y="${anchorY + offset[1]}" class="feature-label">${escapeText(label)}</text>`)
    }
    const styleColor = record.style?.color
    const outline = record.style?.outlineColor ?? '#ffffff'
    const outlineWidth = record.style?.outlineWidth ?? 2
    const lineWidth = record.style?.lineWidth ?? 4
    if (record.mode === 'area') return `<polygon data-record-id="${escapeText(record.id)}" points="${points}" fill="${styleColor ?? options.areaColor}44" stroke="${outline}" stroke-width="${outlineWidth}" class="area report-shape"/>`
    if (record.mode === 'line' || record.mode === 'route') {
      const color = styleColor ?? (record.mode === 'line' ? options.lineColor : options.routeColor)
      const dash = record.mode === 'route' ? ' stroke-dasharray="12 8"' : ''
      return `<polyline points="${points}" stroke="${outline}" stroke-width="${lineWidth + outlineWidth * 2}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline data-record-id="${escapeText(record.id)}" points="${points}" stroke="${color}" stroke-width="${lineWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"${dash} class="report-shape"/>`
    }
    return pointShape(record.style?.symbol ?? options.pointSymbol, x(first.longitude), y(first.latitude), styleColor ?? options.pointColor, outline, outlineWidth, record.id)
  }).join('')
  const midLat = (minLat + maxLat) / 2
  const extentMetres = distanceMetres({ latitude: midLat, longitude: minLon, timestamp: 0 }, { latitude: midLat, longitude: maxLon, timestamp: 0 })
  const scaleMetres = niceScale(extentMetres / 5)
  const scalePixels = (scaleMetres / extentMetres) * mapWidth
  const scaleLabel = scaleMetres >= 1000 ? scaleMetres / 1000 + ' km' : scaleMetres + ' m'
  const attributionText = (BASEMAPS[options.basemap]?.attribution ?? '').replace(/<[^>]+>/g, '').replaceAll('&copy;', '©').replaceAll('&amp;', '&')
  const attribution = options.basemap === 'none' ? '' : `<text x="${pad + mapWidth - 8}" y="${pad + mapHeight - 8}" text-anchor="end" class="attribution">${escapeText(attributionText)}</text>`
  const legendItems = [options.showPoints && 'Points', options.showLines && 'Lines', options.showAreas && 'Areas', options.showRoutes && 'Routes'].filter(Boolean).join(' · ')
  const weatherStamp = options.showWeather && weather ? `<text x="${width - pad}" y="57" text-anchor="end" class="weather-stamp">${weather.temperature.toFixed(1)} °C · Wind ${weather.windSpeed.toFixed(0)} km/h · Rain ${weather.precipitation.toFixed(1)} mm</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mudmap for ${escapeText(project.name)}"><defs><clipPath id="map-clip"><rect x="${pad}" y="${pad}" width="${mapWidth}" height="${mapHeight}" rx="8"/></clipPath></defs><style>text{font-family:Arial,sans-serif;fill:${options.labelColor}}.title{font-size:25px;font-weight:700}.subtitle{font-size:13px;fill:#65736f}.weather-stamp{font-size:11px;font-weight:700;fill:${options.labelColor}}.grid{stroke:${options.labelColor}33;stroke-width:1}.frame{fill:${options.backgroundColor};stroke:${options.labelColor}66;stroke-width:2}.point{stroke:white;stroke-width:2}.line,.route{fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.route{stroke-dasharray:10 7}.area{stroke-width:3}.feature-label{font-size:11px;font-weight:700;paint-order:stroke;stroke:white;stroke-width:3px;stroke-linejoin:round}.north{font-size:13px;font-weight:700}.scale{stroke:${options.labelColor};stroke-width:3}.legend{font-size:11px;font-weight:700}.attribution{font-size:8px;fill:#52625e;paint-order:stroke;stroke:white;stroke-width:3px}</style><rect width="100%" height="100%" fill="white"/><text x="${pad}" y="36" class="title">${escapeText(project.name)}</text><text x="${pad}" y="57" class="subtitle">${escapeText(project.code)} · FieldNote mudmap · WGS 84 · ${new Date().toLocaleString()}</text>${weatherStamp}<rect x="${pad}" y="${pad}" width="${mapWidth}" height="${mapHeight}" rx="8" class="frame"/><g clip-path="url(#map-clip)">${basemapTiles}${options.showGrid ? `<g class="grid">${grid}</g>` : ''}${shapes}${labels.join('')}${attribution}</g>${options.showNorthArrow ? `<g transform="translate(${width - 116} 92)"><path d="M24 0L42 46L24 37L6 46Z" fill="${options.labelColor}"/><text x="24" y="64" text-anchor="middle" class="north">N</text></g>` : ''}${options.showScale ? `<g transform="translate(${pad + 18} ${pad + mapHeight - 27})"><line x1="0" y1="0" x2="${scalePixels}" y2="0" class="scale"/><line x1="0" y1="-7" x2="0" y2="7" class="scale"/><line x1="${scalePixels}" y1="-7" x2="${scalePixels}" y2="7" class="scale"/><text x="${scalePixels / 2}" y="-11" text-anchor="middle" class="legend">${scaleLabel}</text></g>` : ''}${options.showLegend ? `<text x="${pad + 12}" y="${pad + 20}" class="legend">${legendItems}</text>` : ''}<text x="${pad}" y="${height - 23}" class="subtitle">Indicative field sketch — not a survey plan. ${visibleRecords.length} visible of ${records.length} mapped records.</text></svg>`
}

async function embedTileImages(svg: string) {
  const urls = [...new Set(Array.from(svg.matchAll(/<image href="([^"]+)"/g), (match) => match[1]))]
  let result = svg
  await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url)
      if (!response.ok) { result = result.replaceAll(`<image href="${url}"`, `<image data-unavailable="true"`); return }
      const blob = await response.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error)
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(blob)
      })
      result = result.replaceAll(url, dataUrl)
    } catch { result = result.replaceAll(`<image href="${url}"`, `<image data-unavailable="true"`) }
  }))
  return result
}

async function mudmapSvg(project: Project, records: FieldRecord[], options: MudmapOptions, extent?: MapExtent, weather?: WeatherSnapshot | null) {
  const svg = await embedTileImages(renderMudmapSvg(project, records, 1100, 720, options, extent, weather))
  return svg
}

/** Returns a self-contained SVG safe for canvas/PDF rendering on Android. */
export function renderMudmapRasterSvg(project: Project, records: FieldRecord[], options: MudmapOptions = DEFAULT_MUDMAP_OPTIONS, weather?: WeatherSnapshot | null) {
  return mudmapSvg(project, records, options, undefined, weather)
}

async function svgToPng(svg: string, width = 1650, height = 1080) {
  const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The map image could not be rendered.')); image.src = imageUrl })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image rendering is not available on this device.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The PNG could not be created.')), 'image/png', .94))
  } finally { URL.revokeObjectURL(imageUrl) }
}

export async function downloadMudmap(project: Project, records: FieldRecord[], options: MudmapOptions = DEFAULT_MUDMAP_OPTIONS, format: 'svg' | 'png' | 'pdf' | 'doc' | 'html' = 'png', action: FileAction = 'save', weather?: WeatherSnapshot | null) {
  const svg = await mudmapSvg(project, records, options, undefined, weather)
  if (format === 'png') return downloadBlob(await svgToPng(svg), `${projectSlug(project)}-mudmap.png`, action)
  if (format === 'svg') return downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${projectSlug(project)}-mudmap.svg`, action)
  if (format === 'pdf') {
    const [{ jsPDF }, png] = await Promise.all([import('jspdf'), svgToPng(svg)])
    const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    document.addImage(await blobDataUrl(png), 'PNG', 8, 8, 281, 184)
    return downloadBlob(document.output('blob'), `${projectSlug(project)}-mudmap.pdf`, action)
  }
  const interactive = format === 'html'
  const tools = interactive ? '<div class="tools"><button onclick="zoom(-.15)">−</button><button onclick="zoom(.15)">+</button><button onclick="scale=1;apply()">Fit</button></div>' : ''
  const script = interactive ? '<script>let scale=1;const map=document.getElementById("map");function apply(){map.style.transform=`scale(${scale})`}function zoom(step){scale=Math.max(.25,Math.min(4,scale+step));apply()}document.addEventListener("wheel",e=>{if(e.ctrlKey){e.preventDefault();zoom(e.deltaY < 0 ? .1 : -.1)}},{passive:false})</script>' : ''
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeText(project.name)} mudmap</title><style>html,body{height:100%;margin:0;background:#222;font-family:Arial}.tools{position:fixed;z-index:2;top:12px;right:12px;display:flex;gap:6px}.tools button{min-width:42px;height:42px;border:0;border-radius:9px;background:#31c4d6;font-weight:bold}.canvas{height:100%;display:grid;place-items:center;overflow:auto}.map{width:min(1100px,96vw);transform-origin:center;transition:transform .12s}.map svg{width:100%;height:auto;display:block;box-shadow:0 8px 30px #0008}</style></head><body>${tools}<div class="canvas"><div class="map" id="map">${svg}</div></div>${script}</body></html>`
  return downloadBlob(new Blob([document], { type: format === 'doc' ? 'application/msword' : 'text/html;charset=utf-8' }), `${projectSlug(project)}-mudmap.${format}`, action)
}

export async function downloadMudmapPages(project: Project, allRecords: FieldRecord[], pages: MudmapPageSpec[], options: MudmapOptions, format: 'svg' | 'png' | 'pdf' | 'doc' | 'html', action: FileAction = 'save', weather?: WeatherSnapshot | null) {
  const prepared = pages.map((page, index) => ({ page, index, records: allRecords.filter((record) => page.recordIds.includes(record.id)) })).filter((item) => item.records.length)
  if (!prepared.length) throw new Error('At least one map page must contain an observation.')
  if (prepared.length === 1 && !prepared[0].page.extent) return downloadMudmap({ ...project, name: `${project.name} · ${prepared[0].page.title}` }, prepared[0].records, { ...options, extentPaddingPercent: prepared[0].page.extentPaddingPercent }, format, action, weather)
  const slug = projectSlug(project)
  const pageSvgs = await Promise.all(prepared.map(({ page, records }) => mudmapSvg({ ...project, name: `${project.name} · ${page.title}` }, records, { ...options, extentPaddingPercent: page.extentPaddingPercent }, page.extent, weather)))
  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf')
    const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    for (let index = 0; index < pageSvgs.length; index += 1) {
      if (index) document.addPage('a4', 'landscape')
      document.addImage(await blobDataUrl(await svgToPng(pageSvgs[index])), 'PNG', 8, 8, 281, 184)
    }
    return downloadBlob(document.output('blob'), `${slug}-mudmap-${pageSvgs.length}-pages.pdf`, action)
  }
  if (format === 'html' || format === 'doc') {
    const sections = pageSvgs.map((svg, index) => `<section><h2>${escapeText(prepared[index].page.title)}</h2>${svg}</section>`).join('')
    const document = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeText(project.name)} map book</title><style>@page{size:A4 landscape;margin:8mm}body{margin:0;background:#25282d;font-family:Arial}section{width:min(1100px,96vw);margin:20px auto;padding:10px;background:white;break-after:page}section:last-child{break-after:auto}h2{margin:0 0 8px;font-size:18px}svg{display:block;width:100%;height:auto}@media print{body{background:white}section{width:auto;margin:0;padding:0}}</style></head><body>${sections}</body></html>`
    return downloadBlob(new Blob([document], { type: format === 'doc' ? 'application/msword' : 'text/html;charset=utf-8' }), `${slug}-mudmap-${pageSvgs.length}-pages.${format}`, action)
  }
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (let index = 0; index < pageSvgs.length; index += 1) {
    const pageName = `${String(index + 1).padStart(2, '0')}-${prepared[index].page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    if (format === 'svg') zip.file(`${pageName}.svg`, pageSvgs[index])
    else zip.file(`${pageName}.png`, await svgToPng(pageSvgs[index]))
  }
  return downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `${slug}-mudmap-${pageSvgs.length}-pages.zip`, action)
}

function measurement(record: FieldRecord) {
  if (record.mode === 'area') return formatArea(polygonAreaSquareMetres(record.coordinates))
  if (record.mode === 'line' || record.mode === 'route') return formatDistance(lineLengthMetres(record.coordinates))
  return 'Point'
}

function photoMarkup(attachment: Attachment) {
  const location = attachment.coordinate ? ' · ' + attachment.coordinate.latitude.toFixed(6) + ', ' + attachment.coordinate.longitude.toFixed(6) : ''
  return `<figure><img src="${attachment.dataUrl}" alt=""/><figcaption>${escapeText(attachment.caption || attachment.name)} · ${escapeText(new Date(attachment.capturedAt).toLocaleString())}${location}</figcaption></figure>`
}

function recordMarkup(record: FieldRecord, index: number) {
  const photos = record.attachments.length ? `<div class="photos">${record.attachments.map(photoMarkup).join('')}</div>` : ''
  return `<article><div class="record-head"><span>${index + 1}</span><div><small>${escapeText(record.category)} · ${escapeText(record.mode)}</small><h2>${escapeText(record.label)}</h2></div><b>${escapeText(measurement(record))}</b></div><p>${escapeText(record.notes || 'No notes recorded.')}</p><dl><div><dt>Status</dt><dd>${escapeText(record.status)}</dd></div><div><dt>Operative</dt><dd>${escapeText(record.operative)}</dd></div><div><dt>Collected</dt><dd>${escapeText(new Date(record.createdAt).toLocaleString())}</dd></div><div><dt>Images</dt><dd>${record.attachments.length}</dd></div></dl>${photos}</article>`
}

export function buildReportHtml(project: Project, records: FieldRecord[]) {
  const map = renderMudmapSvg(project, records, 1100, 720)
  const items = records.map(recordMarkup).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeText(project.code)} field report</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#18312d;font:12px/1.5 Arial,sans-serif}.toolbar{position:sticky;top:0;padding:10px;text-align:right;background:#183d37}.toolbar button{padding:10px 16px;border:0;border-radius:7px;font-weight:700;background:#f2b84b;cursor:pointer}header{padding:15px 0 18px;border-bottom:3px solid #183d37}header small{font-weight:700;color:#a06d16;text-transform:uppercase}h1{margin:5px 0 4px;font-size:28px}header p{margin:0;color:#65736f}.map{margin:20px 0}.map svg{width:100%;height:auto;border:1px solid #d8e0da}article{padding:18px 0;break-inside:avoid;border-top:1px solid #d8e0da}.record-head{display:flex;align-items:center;gap:12px}.record-head>span{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;color:white;background:#183d37;font-weight:700}.record-head div{flex:1}.record-head small{color:#9a6a17;font-weight:700;text-transform:uppercase}.record-head h2{margin:0;font-size:17px}.record-head b{font-size:13px}article>p{margin:12px 0;color:#4e605b}dl{display:grid;grid-template-columns:repeat(4,1fr);margin:0;padding:10px;background:#f2f5f1}dt{color:#788681;font-size:9px;text-transform:uppercase}dd{margin:2px 0 0;font-weight:700}.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:12px}figure{margin:0}figure img{width:100%;max-height:240px;object-fit:cover;border-radius:5px}figcaption{margin-top:4px;color:#65736f;font-size:9px}.disclaimer{margin-top:20px;padding-top:10px;border-top:1px solid #bbb;color:#65736f;font-size:9px}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / save PDF</button></div><header><small>${escapeText(project.code)} · ${escapeText(project.client)}</small><h1>${escapeText(project.name)}</h1><p>Field collection report · Generated ${escapeText(new Date().toLocaleString())} · ${records.length} records</p></header><div class="map">${map}</div><main>${items}</main><p class="disclaimer">Coordinates and measurements are indicative unless collected with a suitable calibrated survey instrument and verified workflow. Device accuracy values are provider estimates; confidence conventions vary by platform. Phone mapping is approximate.</p></body></html>`
}

function brandReport(html: string) {
  return html.replaceAll('#18312d', '#171717').replaceAll('#183d37', '#20272a').replaceAll('#f2b84b', '#31c4d6').replaceAll('#9a6a17', '#327886')
}

export function buildInteractiveReportHtml(project: Project, records: FieldRecord[]) {
  const base = brandReport(buildReportHtml(project, records))
  const interactiveStyles = `<style>.interactive-tools{position:sticky;top:0;z-index:5;display:flex;gap:8px;padding:10px;background:#111}.interactive-tools input,.interactive-tools select{min-height:38px;padding:0 10px;border:0;border-radius:7px}.interactive-tools input{flex:1}.interactive-tools button{padding:0 13px;border:0;border-radius:7px;background:#31c4d6;font-weight:800}.report-record-hidden{display:none}.report-record-selected{outline:3px solid #31c4d6;outline-offset:-3px;background:#eefbfc}article{cursor:pointer}</style>`
  const interactiveTools = `<div class="interactive-tools"><input id="report-search" placeholder="Search records, notes or operative"><select id="report-mode"><option value="">All geometry</option><option>point</option><option>line</option><option>area</option><option>route</option></select><button type="button" onclick="window.print()">PDF / print</button></div>`
  const script = `<script>(()=>{const items=[...document.querySelectorAll('article')];const search=document.getElementById('report-search');const mode=document.getElementById('report-mode');items.forEach(a=>a.addEventListener('click',()=>a.classList.toggle('report-record-selected')));function filter(){const q=search.value.toLowerCase();const m=mode.value;items.forEach(a=>a.classList.toggle('report-record-hidden',!a.innerText.toLowerCase().includes(q)||(m&&!a.innerText.toLowerCase().includes('· '+m))));}search.addEventListener('input',filter);mode.addEventListener('change',filter);})();</script>`
  return base.replace('</head>', `${interactiveStyles}</head>`).replace('<body>', `<body>${interactiveTools}`).replace('</body>', `${script}</body>`)
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export async function downloadFieldReport(project: Project, records: FieldRecord[], format: 'html' | 'doc' | 'pdf') {
  const slug = projectSlug(project)
  if (format === 'html') return downloadBlob(new Blob([buildInteractiveReportHtml(project, records)], { type: 'text/html;charset=utf-8' }), `${slug}-report.html`)
  if (format === 'doc') return downloadBlob(new Blob([brandReport(buildReportHtml(project, records))], { type: 'application/msword' }), `${slug}-report.doc`)

  const [{ jsPDF }, png] = await Promise.all([
    import('jspdf'),
    mudmapSvg(project, records, DEFAULT_MUDMAP_OPTIONS).then((svg) => svgToPng(svg, 1650, 1080)),
  ])
  const document = new jsPDF({ unit: 'mm', format: 'a4' })
  document.setTextColor(18, 18, 18)
  document.setFontSize(10)
  document.setTextColor(255, 121, 0)
  document.text(`${project.code} · ${project.client}`, 15, 16)
  document.setTextColor(18, 18, 18)
  document.setFontSize(22)
  document.text(project.name, 15, 27)
  document.setFontSize(9)
  document.text(`Field report · ${records.length} records · ${new Date().toLocaleString()}`, 15, 34)
  document.addImage(await blobDataUrl(png), 'PNG', 15, 40, 180, 118)
  let y = 169
  records.forEach((record, index) => {
    if (y > 270) { document.addPage(); y = 18 }
    document.setFillColor(255, 121, 0)
    document.circle(19, y - 1, 4, 'F')
    document.setTextColor(255, 255, 255)
    document.setFontSize(8)
    document.text(String(index + 1), 19, y + 1, { align: 'center' })
    document.setTextColor(18, 18, 18)
    document.setFontSize(12)
    document.text(record.label, 27, y)
    document.setFontSize(8)
    document.text(`${record.category} · ${record.mode} · ${record.status} · ${new Date(record.createdAt).toLocaleString()}`, 27, y + 5)
    const notes = document.splitTextToSize(record.notes || 'No notes recorded.', 165)
    document.text(notes, 27, y + 11)
    y += 18 + notes.length * 3
  })
  const blob = document.output('blob')
  return downloadBlob(blob, `${slug}-report.pdf`)
}

export function openFieldReport(project: Project, records: FieldRecord[]) {
  const report = window.open('', '_blank')
  if (!report) throw new Error('The browser blocked the report window. Allow pop-ups for FieldNote and try again.')
  report.document.open()
  report.document.write(buildReportHtml(project, records))
  report.document.close()
}
