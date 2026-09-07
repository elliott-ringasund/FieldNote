import { describe, expect, it } from 'vitest'
import { buildReportHtml, DEFAULT_MUDMAP_OPTIONS, renderMudmapSvg } from './report'
import type { FieldRecord, Project, WeatherSnapshot } from '../types'

const project: Project = { id: 'p1', name: 'Test & survey', code: 'T-01', client: 'Operations', description: '', status: 'active', color: '#000', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
const record: FieldRecord = { id: 'r1', projectId: 'p1', mode: 'point', category: 'Asset', label: 'Gate <north>', notes: 'Checked', status: 'complete', coordinates: [{ latitude: 60, longitude: 5, accuracy: 4, source: 'device', timestamp: 0 }], attachments: [], operative: 'Tester', createdAt: '2026-01-01', updatedAt: '2026-01-01', syncStatus: 'local' }
const weather: WeatherSnapshot = { capturedAt: '2026-01-01', latitude: 60, longitude: 5, temperature: 8.4, apparentTemperature: 6, relativeHumidity: 72, precipitation: 0.3, cloudCover: 80, weatherCode: 3, windSpeed: 18, windDirection: 210, windGusts: 30, provider: 'Open-Meteo' }

describe('mudmap and report output', () => {
  it('creates an SVG with cartographic essentials', () => {
    const svg = renderMudmapSvg(project, [record])
    expect(svg).toContain('<svg')
    expect(svg).toContain('Test &amp; survey')
    expect(svg).toContain('not a survey plan')
  })

  it('applies mudmap layer, symbol, label and colour settings', () => {
    const svg = renderMudmapSvg(project, [record], 1100, 720, {
      ...DEFAULT_MUDMAP_OPTIONS,
      basemap: 'none',
      pointSymbol: 'square',
      pointColor: '#ff0000',
      labelMode: 'none',
      showGrid: true,
      showNorthArrow: false,
    })
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('class="grid"')
    expect(svg).not.toContain('Gate &lt;north&gt;')
    expect(svg).not.toContain('text-anchor="middle" class="north"')
  })

  it('uses an explicitly framed touch-map extent without automatic padding', () => {
    const svg = renderMudmapSvg(project, [record], 1100, 720, { ...DEFAULT_MUDMAP_OPTIONS, basemap: 'none' }, { minLongitude: 4, maxLongitude: 8, minLatitude: 59, maxLatitude: 61 })
    const markerStart = svg.match(/<path d="M([\d.-]+) [\d.-]+C[^>]+data-record-id="r1"/)
    expect(markerStart).not.toBeNull()
    expect(Number(markerStart?.[1])).toBeLessThan(500)
  })

  it('adds a compact weather stamp when output weather is enabled', () => {
    const svg = renderMudmapSvg(project, [record], 1100, 720, DEFAULT_MUDMAP_OPTIONS, undefined, weather)
    expect(svg).toContain('8.4 °C')
    expect(svg).toContain('Wind 18 km/h')
    expect(svg).toContain('Rain 0.3 mm')
    expect(renderMudmapSvg(project, [record], 1100, 720, { ...DEFAULT_MUDMAP_OPTIONS, showWeather: false }, undefined, weather)).not.toContain('8.4 °C')
  })

  it('escapes record text in the printable report', () => {
    const report = buildReportHtml(project, [record])
    expect(report).toContain('Gate &lt;north&gt;')
    expect(report).toContain('Print / save PDF')
  })
})
