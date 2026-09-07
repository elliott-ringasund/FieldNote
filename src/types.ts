export type CollectionMode = 'point' | 'line' | 'area' | 'route'

export type Coordinate = {
  latitude: number
  longitude: number
  accuracy?: number
  accuracyReference?: 'browser-95' | 'android-68' | 'provider'
  altitude?: number | null
  altitudeAccuracy?: number | null
  heading?: number | null
  speed?: number | null
  source?: 'device' | 'manual' | 'imported'
  timestamp: number
}

export type ProjectStatus = 'active' | 'draft' | 'complete'
export type RecordStatus = 'complete' | 'needs-review' | 'follow-up'
export type SyncStatus = 'local' | 'synced'

export type Project = {
  id: string
  name: string
  code: string
  client: string
  folder?: string
  description: string
  status: ProjectStatus
  color: string
  coordinateSystem?: string
  layers?: ProjectLayer[]
  activeLayerId?: string
  createdAt: string
  updatedAt: string
}

export type UserProfile = {
  name: string
  company: string
  email: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

export type RecordStyle = {
  color?: string
  outlineColor?: string
  outlineWidth?: number
  symbol?: 'pin' | 'circle' | 'square' | 'triangle'
  showLabel?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  lineWidth?: number
  autoScale?: boolean
}

export type ProjectLayer = {
  id: string
  /** Stable link back to a reusable live-collection definition. */
  collectionDefinitionId?: string
  name: string
  /** Short field code used for automatic labels such as MH-001. */
  code?: string
  group: string
  geometryType: CollectionMode
  visible: boolean
  locked: boolean
  order: number
  style: RecordStyle
}

/** A feature/layer definition learned while the operative is collecting. */
export type CollectionDefinition = {
  id: string
  name: string
  code: string
  geometryType: CollectionMode
  group: string
  style: RecordStyle
  createdAt: string
  lastUsedAt: string
}

export type WeatherSnapshot = {
  capturedAt: string
  latitude: number
  longitude: number
  temperature: number
  apparentTemperature: number
  relativeHumidity: number
  precipitation: number
  cloudCover: number
  weatherCode: number
  windSpeed: number
  windDirection: number
  windGusts: number
  provider: 'Open-Meteo'
}

export type Attachment = {
  id: string
  name: string
  dataUrl: string
  caption: string
  capturedAt: string
  source: 'camera' | 'library' | 'import'
  coordinate?: Coordinate
}

export type FieldRecord = {
  id: string
  projectId: string
  layerId?: string
  mode: CollectionMode
  category: string
  label: string
  notes: string
  status: RecordStatus
  coordinates: Coordinate[]
  attachments: Attachment[]
  operative: string
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  source?: 'field' | 'import'
  geometryHistory?: Array<{ changedAt: string; operative: string; coordinates: Coordinate[] }>
  sourceCrs?: string
  attributes?: Record<string, string | number | boolean | null>
  style?: RecordStyle
}

export type CaptureDraft = {
  projectId: string
  mode: CollectionMode
  coordinates: Coordinate[]
  startedAt: string
  layerId?: string
  editingRecordId?: string
  paused: boolean
}

export const MODE_LABELS: Record<CollectionMode, string> = {
  point: 'Point',
  line: 'Line',
  area: 'Area',
  route: 'Route',
}

export const CATEGORY_PRESETS: Record<CollectionMode, string[]> = {
  point: ['Asset', 'Defect', 'Inspection point', 'Reference marker', 'Other'],
  line: ['Boundary', 'Pipe or cable', 'Path or access', 'Fence', 'Other'],
  area: ['Work area', 'Inspection area', 'Habitat', 'Damage extent', 'Other'],
  route: ['Site walk', 'Inspection route', 'Vehicle route', 'Access route', 'Other'],
}
