import { openDB, type DBSchema } from 'idb'
import type { FieldRecord, Project } from '../types'
import { defaultProjectLayers } from './layers'

interface FieldNoteDatabase extends DBSchema {
  projects: {
    key: string
    value: Project
  }
  records: {
    key: string
    value: FieldRecord
    indexes: { 'by-project': string; 'by-created': string }
  }
  preferences: {
    key: string
    value: { key: string; value: string }
  }
}

const databasePromise = openDB<FieldNoteDatabase>('fieldnote-beta', 1, {
  upgrade(database) {
    database.createObjectStore('projects', { keyPath: 'id' })
    const records = database.createObjectStore('records', { keyPath: 'id' })
    records.createIndex('by-project', 'projectId')
    records.createIndex('by-created', 'createdAt')
    database.createObjectStore('preferences', { keyPath: 'key' })
  },
})

const now = new Date().toISOString()

export const starterProject: Project = {
  id: 'starter-harbour-survey',
  name: 'Harbour asset survey',
  code: 'FIELD-001',
  client: 'Demo project',
  description: 'A starter project for testing points, lines, areas, routes and field observations.',
  status: 'active',
  color: '#31c4d6',
  layers: defaultProjectLayers('starter-harbour-survey'),
  activeLayerId: 'starter-harbour-survey-point',
  createdAt: now,
  updatedAt: now,
}

const starterRecords: FieldRecord[] = [
  {
    id: 'starter-record-1',
    projectId: starterProject.id,
    layerId: 'starter-harbour-survey-point',
    mode: 'point',
    category: 'Asset',
    label: 'Access gate',
    notes: 'Gate condition is serviceable. Photograph required on the next visit.',
    status: 'complete',
    coordinates: [
      { latitude: 60.39278, longitude: 5.30895, accuracy: 5.4, source: 'device', timestamp: Date.now() - 3_600_000 },
    ],
    attachments: [],
    operative: 'Field operative',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    syncStatus: 'local',
  },
  {
    id: 'starter-record-2',
    projectId: starterProject.id,
    layerId: 'starter-harbour-survey-line',
    mode: 'line',
    category: 'Path or access',
    label: 'Quayside access',
    notes: 'Walked section; surface becomes uneven at the northern end.',
    status: 'needs-review',
    coordinates: [
      { latitude: 60.39246, longitude: 5.3082, accuracy: 4.8, source: 'device', timestamp: Date.now() - 2_900_000 },
      { latitude: 60.39293, longitude: 5.30848, accuracy: 5.2, source: 'device', timestamp: Date.now() - 2_850_000 },
      { latitude: 60.39334, longitude: 5.30871, accuracy: 5.9, source: 'device', timestamp: Date.now() - 2_800_000 },
    ],
    attachments: [],
    operative: 'Field operative',
    createdAt: new Date(Date.now() - 2_900_000).toISOString(),
    updatedAt: new Date(Date.now() - 2_800_000).toISOString(),
    syncStatus: 'local',
  },
]

export async function initialiseDatabase() {
  const database = await databasePromise
  if ((await database.count('projects')) === 0) {
    const transaction = database.transaction(['projects', 'records', 'preferences'], 'readwrite')
    await transaction.objectStore('projects').put(starterProject)
    for (const record of starterRecords) await transaction.objectStore('records').put(record)
    await transaction.objectStore('preferences').put({ key: 'activeProjectId', value: starterProject.id })
    await transaction.done
  }
}

export async function listProjects() {
  return (await databasePromise).getAll('projects')
}

export async function saveProject(project: Project) {
  await (await databasePromise).put('projects', project)
}

export async function deleteProject(projectId: string) {
  const database = await databasePromise
  const recordKeys = await database.getAllKeysFromIndex('records', 'by-project', projectId)
  const transaction = database.transaction(['projects', 'records'], 'readwrite')
  await Promise.all(recordKeys.map((key) => transaction.objectStore('records').delete(key)))
  await transaction.objectStore('projects').delete(projectId)
  await transaction.done
}

export async function listRecords(projectId?: string) {
  const database = await databasePromise
  const records = projectId
    ? await database.getAllFromIndex('records', 'by-project', projectId)
    : await database.getAll('records')
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function saveRecord(record: FieldRecord) {
  await (await databasePromise).put('records', record)
}

export async function deleteRecord(recordId: string) {
  await (await databasePromise).delete('records', recordId)
}

export async function saveRecords(records: FieldRecord[]) {
  const database = await databasePromise
  const transaction = database.transaction('records', 'readwrite')
  await Promise.all(records.map((record) => transaction.store.put(record)))
  await transaction.done
}

export async function getPreference(key: string) {
  return (await databasePromise).get('preferences', key)
}

export async function setPreference(key: string, value: string) {
  await (await databasePromise).put('preferences', { key, value })
}

export async function deletePreference(key: string) {
  await (await databasePromise).delete('preferences', key)
}
