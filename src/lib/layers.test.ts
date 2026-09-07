import { describe, expect, it } from 'vitest'
import { assignRecordLayer, defaultProjectLayers, effectiveRecordStyle, ensureProjectLayers, layerForMode } from './layers'
import type { FieldRecord, Project } from '../types'

const project: Project = { id: 'p1', name: 'Test', code: 'T', client: '', description: '', status: 'active', color: '#f80', createdAt: '', updatedAt: '' }
const record: FieldRecord = { id: 'r1', projectId: 'p1', mode: 'line', category: 'Fence', label: 'Fence', notes: '', status: 'complete', coordinates: [], attachments: [], operative: '', createdAt: '', updatedAt: '', syncStatus: 'local' }

describe('project layers', () => {
  it('creates a stable field layer for every collection mode', () => {
    const layers = defaultProjectLayers(project.id)
    expect(layers.map((layer) => layer.geometryType)).toEqual(['point', 'line', 'area', 'route'])
    expect(layerForMode(layers, 'area')?.name).toBe('Areas')
  })

  it('hydrates old projects and records without discarding field data', () => {
    const hydrated = ensureProjectLayers(project)
    const assigned = assignRecordLayer(record, hydrated)
    expect(hydrated.layers).toHaveLength(4)
    expect(assigned.layerId).toBe('p1-line')
  })

  it('lets feature-level styling override its layer defaults', () => {
    const layers = defaultProjectLayers(project.id)
    const assigned = assignRecordLayer({ ...record, style: { color: '#00ff00' } }, { ...project, layers })
    expect(effectiveRecordStyle(assigned, layers).color).toBe('#00ff00')
    expect(effectiveRecordStyle(assigned, layers).lineWidth).toBe(3)
  })
})
