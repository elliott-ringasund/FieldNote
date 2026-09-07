import { suggestCollectionCode } from './collectionLibrary'
import type { CollectionMode, FieldRecord, Project, ProjectLayer, RecordStyle } from '../types'

const DEFAULT_LAYER_DETAILS: Array<{ geometryType: CollectionMode; name: string; code: string; color: string; style?: Partial<RecordStyle> }> = [
  { geometryType: 'point', name: 'Observations', code: 'OBS', color: '#31c4d6', style: { symbol: 'circle' } },
  { geometryType: 'line', name: 'Lines', code: 'LN', color: '#dce3e5', style: { lineWidth: 3 } },
  { geometryType: 'area', name: 'Areas', code: 'AR', color: '#81949b', style: { outlineWidth: 2 } },
  { geometryType: 'route', name: 'Routes', code: 'RT', color: '#20272a', style: { lineWidth: 3 } },
]

export function defaultProjectLayers(projectId: string): ProjectLayer[] {
  return DEFAULT_LAYER_DETAILS.map((item, order) => ({
    id: `${projectId}-${item.geometryType}`,
    name: item.name,
    code: item.code,
    group: 'Field data',
    geometryType: item.geometryType,
    visible: true,
    locked: false,
    order,
    style: {
      color: item.color,
      outlineColor: '#ffffff',
      outlineWidth: 1,
      showLabel: true,
      autoScale: true,
      ...item.style,
    },
  }))
}

export function orderedLayers(layers: ProjectLayer[]): ProjectLayer[] {
  return [...layers].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export function layerForMode(layers: ProjectLayer[], mode: CollectionMode): ProjectLayer | undefined {
  return orderedLayers(layers).find((layer) => layer.geometryType === mode && !layer.locked)
    ?? orderedLayers(layers).find((layer) => layer.geometryType === mode)
}

export function ensureProjectLayers(project: Project): Project {
  const layers = project.layers?.length ? orderedLayers(project.layers).map((layer, order) => ({
    ...layer,
    code: layer.code?.trim().toUpperCase() || suggestCollectionCode(layer.name),
    group: layer.group?.trim() || 'Field data',
    visible: layer.visible !== false,
    locked: layer.locked === true,
    order,
    style: { outlineColor: '#ffffff', showLabel: true, autoScale: true, ...layer.style },
  })) : defaultProjectLayers(project.id)
  const activeLayerId = layers.some((layer) => layer.id === project.activeLayerId)
    ? project.activeLayerId
    : layers.find((layer) => !layer.locked)?.id ?? layers[0]?.id
  return { ...project, layers, activeLayerId }
}

export function assignRecordLayer(record: FieldRecord, project: Project): FieldRecord {
  const layers = project.layers ?? defaultProjectLayers(project.id)
  if (record.layerId && layers.some((layer) => layer.id === record.layerId)) return record
  const layer = layerForMode(layers, record.mode)
  return layer ? { ...record, layerId: layer.id } : record
}

export function effectiveRecordStyle(record: FieldRecord, layers: ProjectLayer[]): RecordStyle {
  const layer = layers.find((item) => item.id === record.layerId)
  return { ...layer?.style, ...record.style }
}

export function createProjectLayer(projectId: string, name: string, geometryType: CollectionMode, group = 'Field data'): ProjectLayer {
  const defaults = DEFAULT_LAYER_DETAILS.find((item) => item.geometryType === geometryType)!
  return {
    id: `${projectId}-${geometryType}-${crypto.randomUUID()}`,
    name: name.trim(),
    code: suggestCollectionCode(name),
    group: group.trim() || 'Field data',
    geometryType,
    visible: true,
    locked: false,
    order: Number.MAX_SAFE_INTEGER,
    style: {
      color: defaults.color,
      outlineColor: '#ffffff',
      outlineWidth: geometryType === 'area' ? 2 : 1,
      lineWidth: geometryType === 'point' ? undefined : 3,
      symbol: geometryType === 'point' ? 'pin' : undefined,
      showLabel: true,
      autoScale: true,
    },
  }
}
