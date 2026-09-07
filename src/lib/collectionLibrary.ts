import type { CollectionDefinition, CollectionMode, ProjectLayer, RecordStyle } from '../types'

const DEFINITION_COLORS = ['#31c4d6', '#e2e8ea', '#87999f', '#60747b', '#6aabb7', '#b5c1c5']

export function suggestCollectionCode(name: string): string {
  const words = name.trim().match(/[A-Za-z0-9]+/g) ?? []
  if (!words.length) return 'OBS'
  if (words.length > 1) return words.map((word) => word.charAt(0)).join('').slice(0, 5).toUpperCase()
  const word = words[0]!.toUpperCase()
  return word.length <= 4 ? word : `${word.charAt(0)}${word.slice(1).replace(/[AEIOU]/g, '').slice(0, 3)}`
}

export function defaultDefinitionStyle(geometryType: CollectionMode, index = 0): RecordStyle {
  return {
    color: DEFINITION_COLORS[index % DEFINITION_COLORS.length],
    outlineColor: '#f5f7f8',
    outlineWidth: geometryType === 'area' ? 2 : 1,
    lineWidth: geometryType === 'point' ? undefined : 3,
    symbol: geometryType === 'point' ? 'circle' : undefined,
    showLabel: true,
    autoScale: true,
  }
}

export function createCollectionDefinition(
  input: Pick<CollectionDefinition, 'name' | 'geometryType'> & Partial<CollectionDefinition>,
  index = 0,
): CollectionDefinition {
  const timestamp = new Date().toISOString()
  const name = input.name.trim() || 'Observation'
  return {
    id: input.id ?? crypto.randomUUID(),
    name,
    code: (input.code?.trim() || suggestCollectionCode(name)).toUpperCase(),
    geometryType: input.geometryType,
    group: input.group?.trim() || 'Field data',
    style: { ...defaultDefinitionStyle(input.geometryType, index), ...input.style },
    createdAt: input.createdAt ?? timestamp,
    lastUsedAt: input.lastUsedAt ?? timestamp,
  }
}

export function definitionToProjectLayer(projectId: string, definition: CollectionDefinition, order: number): ProjectLayer {
  return {
    id: `${projectId}-${definition.geometryType}-${crypto.randomUUID()}`,
    collectionDefinitionId: definition.id,
    name: definition.name,
    code: definition.code,
    group: definition.group,
    geometryType: definition.geometryType,
    visible: true,
    locked: false,
    order,
    style: { ...definition.style },
  }
}

export function parseCollectionLibrary(value?: string): CollectionDefinition[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is CollectionDefinition => Boolean(
      item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.code === 'string'
      && ['point', 'line', 'area', 'route'].includes(item.geometryType) && typeof item.group === 'string',
    )).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
  } catch {
    return []
  }
}

export function nextFeatureLabel(layer: ProjectLayer | undefined, recordsInLayer: number): string {
  const prefix = layer?.code?.trim().toUpperCase() || suggestCollectionCode(layer?.name ?? 'Observation')
  return `${prefix}-${String(recordsInLayer + 1).padStart(3, '0')}`
}
