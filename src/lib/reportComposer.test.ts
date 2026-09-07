import { describe, expect, it } from 'vitest'
import { buildInteractiveReportHtml, defaultReportOptions } from './reportComposer'
import type { FieldRecord, Project, UserProfile, WeatherSnapshot } from '../types'

const project: Project = { id: 'p', name: 'Roof inspection', code: 'RF-2', client: 'North Works', description: '', status: 'active', color: '#f70', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
const records: FieldRecord[] = [
  { id: 'first', projectId: 'p', mode: 'point', category: 'Defect', label: 'Flashing defect', notes: 'Sealant split', status: 'follow-up', coordinates: [{ latitude: 51, longitude: -1, accuracy: 3, timestamp: 0 }], attachments: [], operative: 'Alex', attributes: { severity: 'High', safe: false }, createdAt: '2026-01-01', updatedAt: '2026-01-01', syncStatus: 'local', style: { outlineColor: '#00ff00', outlineWidth: 6 } },
  { id: 'second', projectId: 'p', mode: 'point', category: 'Asset', label: 'Outlet', notes: 'Clear', status: 'complete', coordinates: [{ latitude: 51.001, longitude: -1.001, timestamp: 0 }], attachments: [], operative: 'Alex', createdAt: '2026-01-01', updatedAt: '2026-01-01', syncStatus: 'local' },
]
const profile: UserProfile = { name: 'Alex Field', company: 'North Survey', email: 'alex@example.com' }
const weather: WeatherSnapshot = { capturedAt: '2026-01-01', latitude: 51, longitude: -1, temperature: 12, apparentTemperature: 11, relativeHumidity: 75, precipitation: 0.2, cloudCover: 60, weatherCode: 2, windSpeed: 15, windDirection: 220, windGusts: 25, provider: 'Open-Meteo' }

describe('modular interactive report', () => {
  it('links map geometry to full observation information', () => {
    const html = buildInteractiveReportHtml(project, records, defaultReportOptions(records), profile, weather)
    expect(html).toContain('data-record-id="first"')
    expect(html).toContain('observation-first')
    expect(html).toContain('severity')
    expect(html).toContain('Alex Field')
    expect(html).toContain('North Survey')
    expect(html).toContain('Open-Meteo snapshot')
    expect(html).toContain('data-open-id="first"')
    expect(html).toContain('Back to summary')
  })

  it('obeys record, content and module selection', () => {
    const options = { ...defaultReportOptions(records), recordIds: ['first'], sections: ['cover', 'observations'] as const, includeComments: false, includeAttributes: false }
    const html = buildInteractiveReportHtml(project, records, { ...options, sections: [...options.sections] }, profile, weather)
    expect(html).toContain('Flashing defect')
    expect(html).not.toContain('Outlet')
    expect(html).not.toContain('Sealant split')
    expect(html).not.toContain('severity')
    expect(html).not.toContain('Project map')
  })

  it('applies the selected report palette to the document and map geometry', () => {
    const html = buildInteractiveReportHtml(project, records, { ...defaultReportOptions(records), primaryColor: '#123456', secondaryColor: '#654321' }, profile, weather)
    expect(html).toContain('--orange:#123456')
    expect(html).toContain('--navy:#654321')
    expect(html).toContain('fill="#123456"')
    expect(html).toContain('fill:#654321')
  })
})
