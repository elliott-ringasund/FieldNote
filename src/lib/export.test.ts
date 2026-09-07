import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import Papa from 'papaparse'
import { buildHandover, recordsToCsv, recordsToFeatureCollection } from './export'
import type { FieldRecord, Project } from '../types'

const project: Project = { id: 'p1', name: 'Test survey', code: 'T-01', client: 'Test', description: '', status: 'active', color: '#000', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
const baseRecord: FieldRecord = { id: 'r1', projectId: 'p1', mode: 'point', category: 'Asset', label: 'Gate', notes: '', status: 'complete', coordinates: [{ latitude: 60, longitude: 5, accuracy: 4, timestamp: 0 }], attachments: [], operative: 'Tester', createdAt: '2026-01-01', updatedAt: '2026-01-01', syncStatus: 'local' }

describe('GeoJSON export', () => {
  it('uses longitude-latitude order for points', () => {
    const result = recordsToFeatureCollection(project, [baseRecord])
    expect(result.features[0].geometry).toEqual({ type: 'Point', coordinates: [5, 60] })
    expect(result.features[0].properties.accuracy_max_m).toBe(4)
  })

  it('closes polygon rings without changing the stored record', () => {
    const area: FieldRecord = { ...baseRecord, mode: 'area', coordinates: [
      { latitude: 0, longitude: 0, timestamp: 0 },
      { latitude: 0, longitude: 1, timestamp: 0 },
      { latitude: 1, longitude: 1, timestamp: 0 },
    ] }
    const result = recordsToFeatureCollection(project, [area])
    expect(result.features[0].geometry).toEqual({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })
    expect(area.coordinates).toHaveLength(3)
  })
})


describe('handover data integrity', () => {
  it('keeps custom fields without allowing them to overwrite system metadata', () => {
    const row = { ...baseRecord, attributes: { label: 'spoof', project_id: 'other', Diameter: 120 } }
    const feature = recordsToFeatureCollection(project, [row]).features[0]
    expect(feature.properties.label).toBe('Gate')
    expect(feature.properties.project_id).toBe('p1')
    expect(feature.properties.attributes.label).toBe('spoof')
    expect(feature.properties.position_metadata).toEqual(row.coordinates)
  })
  it('preserves multiline text, custom fields and safe spreadsheet values', () => {
    const row = { ...baseRecord, label: '=1+1', notes: 'First, line\nSecond "line"', attributes: { Material: 'Steel', Size: 0 } }
    const parsed = Papa.parse<Record<string,string>>(recordsToCsv(project, [row]), { header: true }).data[0]
    expect(parsed.label).toBe("'=1+1")
    expect(parsed.notes).toBe(row.notes)
    expect(parsed['attribute: Material']).toBe('Steel')
    expect(parsed['attribute: Size']).toBe('0')
  })
  it('never includes another project and retains invalid records outside GIS', async () => {
    const invalid = { ...baseRecord, id: 'invalid', coordinates: [] }
    const foreign = { ...baseRecord, id: 'foreign', projectId: 'p2' }
    const blob = await buildHandover(project, [baseRecord, invalid, foreign])
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const raw = JSON.parse(await zip.file('original-data.json')!.async('string'))
    expect(raw.records.map((r: FieldRecord) => r.id)).toEqual(['r1', 'invalid'])
    const gis = JSON.parse(await zip.file('map.geojson')!.async('string'))
    expect(gis.features).toHaveLength(1)
    expect(await zip.file('records.csv')!.async('string')).toContain('invalid')
    expect(await zip.file('START-HERE.txt')!.async('string')).toContain('INCLUDING pauses')
  })
  it('packages photos with safe names and a record-linked manifest', async () => {
    const row = { ...baseRecord, attachments: [{ id: 'photo', name: '../../image.png', caption: 'Gate latch', capturedAt: '2026-01-01', source: 'library' as const, dataUrl: 'data:image/png;base64,aGVsbG8=' }] }
    const zip = await JSZip.loadAsync(await (await buildHandover(project, [row])).arrayBuffer())
    expect(await zip.file('photos/1-1.png')!.async('string')).toBe('hello')
    expect(await zip.file('photos.csv')!.async('string')).toContain('Gate latch')
    expect(await zip.file('positions.csv')!.async('string')).toContain('legacy-unspecified')
  })
})
