import { ClipboardList, CloudSun, Crosshair, FolderKanban, Keyboard, Layers3, LocateFixed, Map as MapIcon, Maximize2, Pause, PencilLine, Play, Plus, RefreshCw, RotateCcw, Save, Settings, Signal, TableProperties, Trash2, Undo2, WifiOff, Wrench, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import './App.css'
import { SurveyTools } from './components/SurveyTools'
import { geometryIssue, validPosition } from './lib/insights'
import { CollectionMenu } from './components/CollectionMenu'
import { FieldMap } from './components/FieldMap'
import { ProjectsView } from './components/ProjectsView'
import { RecordForm } from './components/RecordForm'
import { RecordsView } from './components/RecordsView'
import { KeyInPointSheet } from './components/KeyInPointSheet'
import { RecordStyleSheet } from './components/RecordStyleSheet'
import { SettingsView } from './components/SettingsView'
import { LayerPanel } from './components/LayerPanel'
import { FeatureEditorSheet } from './components/FeatureEditorSheet'
import { deletePreference, deleteProject, deleteRecord, getPreference, initialiseDatabase, listProjects, listRecords, saveProject, saveRecord, saveRecords, setPreference } from './lib/db'
import { accuracyQuality, formatAccuracy } from './lib/accuracy'
import { BASEMAPS, type BasemapId } from './lib/basemaps'
import { distanceMetres, formatArea, formatDistance, lineLengthMetres, polygonAreaSquareMetres } from './lib/geo'
import { MODE_LABELS, type CaptureDraft, type CollectionDefinition, type CollectionMode, type Coordinate, type FieldRecord, type Project, type ProjectLayer, type ThemePreference, type UserProfile, type WeatherSnapshot } from './types'
import { getDevicePosition, startDevicePositionWatch } from './lib/deviceLocation'
import { getLiveWeather, weatherLabel } from './lib/weather'
import { assignRecordLayer, createProjectLayer, ensureProjectLayers, layerForMode, orderedLayers } from './lib/layers'
import { definitionToProjectLayer, nextFeatureLabel, parseCollectionLibrary } from './lib/collectionLibrary'

type View = 'projects' | 'map' | 'records' | 'settings'
const ImportDataSheet = lazy(() => import('./components/ImportDataSheet').then((module) => ({ default: module.ImportDataSheet })))
const ExportDataSheet = lazy(() => import('./components/ExportDataSheet').then((module) => ({ default: module.ExportDataSheet })))
function App() {
  const [view, setView] = useState<View>('projects')
  const [projects, setProjects] = useState<Project[]>([])
  const [records, setRecords] = useState<FieldRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(navigator.onLine)
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState<CaptureDraft | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [currentPosition, setCurrentPosition] = useState<Coordinate | null>(null)
  const [locationMessage, setLocationMessage] = useState('Location not requested')
  const [toast, setToast] = useState('')
  const [basemap, setBasemap] = useState<BasemapId>('streets')
  const [layersOpen, setLayersOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([])
  const [keyInOpen, setKeyInOpen] = useState(false)
  const [surveyToolsOpen, setSurveyToolsOpen] = useState(false)
  const [locationBusy, setLocationBusy] = useState(false)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const captureGeneration = useRef(0)
  const [mapToolsOpen, setMapToolsOpen] = useState(false)
  const [stylingRecord, setStylingRecord] = useState<FieldRecord | null>(null)
  const [editingAttributes, setEditingAttributes] = useState<FieldRecord | null>(null)
  const [captureLayerId, setCaptureLayerId] = useState<string | undefined>()
  const [collectionDefinitions, setCollectionDefinitions] = useState<CollectionDefinition[]>([])
  const [profile, setProfile] = useState<UserProfile>({ name: 'Field operative', company: '', email: '' })
  const [theme, setTheme] = useState<ThemePreference>('system')
  const [weatherInOutputs, setWeatherInOutputs] = useState(true)
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [locateRequest, setLocateRequest] = useState(0)
  const [fitRequest, setFitRequest] = useState(0)
  const [lineDrawing, setLineDrawing] = useState(false)
  const [mapView, setMapView] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null)
  const routeWatch = useRef<(() => void) | null>(null)

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const projectRecords = useMemo(() => records.filter((record) => record.projectId === activeProjectId), [records, activeProjectId])
  const activeLayers = useMemo(() => activeProject?.layers ?? [], [activeProject])
  const activeLayer = activeLayers.find((layer) => layer.id === activeProject?.activeLayerId) ?? activeLayers[0]
  const visibleProjectRecords = useMemo(() => {
    const visibleLayerIds = new Set(activeLayers.filter((layer) => layer.visible).map((layer) => layer.id))
    return projectRecords.filter((record) => !record.layerId || visibleLayerIds.has(record.layerId))
  }, [activeLayers, projectRecords])

  const refresh = useCallback(async () => {
    const [storedProjects, storedRecords, projectPreference, capturePreference, profilePreference, themePreference, weatherOutputPreference, collectionLibraryPreference] = await Promise.all([listProjects(), listRecords(), getPreference('activeProjectId'), getPreference('captureDraft'), getPreference('userProfile'), getPreference('theme'), getPreference('weatherInOutputs'), getPreference('collectionLibrary')])
    const hydratedProjects = storedProjects.map(ensureProjectLayers)
    const projectById = new Map(hydratedProjects.map((project) => [project.id, project]))
    const hydratedRecords = storedRecords.map((record) => {
      const project = projectById.get(record.projectId)
      return project ? assignRecordLayer(record, project) : record
    })
    const changedProjects = hydratedProjects.filter((project, index) => JSON.stringify(project) !== JSON.stringify(storedProjects[index]))
    const changedRecords = hydratedRecords.filter((record, index) => JSON.stringify(record) !== JSON.stringify(storedRecords[index]))
    if (changedProjects.length || changedRecords.length) await Promise.all([...changedProjects.map(saveProject), ...(changedRecords.length ? [saveRecords(changedRecords)] : [])])
    setProjects(hydratedProjects)
    setRecords(hydratedRecords)
    setActiveProjectId(projectPreference?.value ?? hydratedProjects[0]?.id ?? '')
    const basemapPreference = await getPreference('basemap')
    const basemapValue = basemapPreference?.value
    if (basemapValue && basemapValue in BASEMAPS) setBasemap(basemapValue as BasemapId)
    if (profilePreference?.value) {
      try { setProfile(JSON.parse(profilePreference.value) as UserProfile) } catch { /* keep safe defaults */ }
    }
    if (themePreference?.value && ['system', 'light', 'dark'].includes(themePreference.value)) setTheme(themePreference.value as ThemePreference)
    if (weatherOutputPreference?.value) setWeatherInOutputs(weatherOutputPreference.value !== 'false')
    setCollectionDefinitions(parseCollectionLibrary(collectionLibraryPreference?.value))
    if (capturePreference?.value) {
      try {
        const recovered = JSON.parse(capturePreference.value) as CaptureDraft
        if (hydratedProjects.some(project => project.id === recovered.projectId) && Array.isArray(recovered.coordinates) && recovered.startedAt && Number.isFinite(new Date(recovered.startedAt).getTime())) {
          setActiveProjectId(recovered.projectId)
          setDraft({ ...recovered, paused: true })
          setCaptureLayerId(recovered.layerId)
          setEditingRecordId(recovered.editingRecordId ?? null)
          setView('map')
          setToast('Recovered an unfinished field capture — tracking is paused')
        }
      } catch { await deletePreference('captureDraft') }
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    initialiseDatabase().then(refresh).catch(() => setToast('Could not open local storage. Reload before collecting data.')).finally(() => setLoading(false))
    const onlineHandler = () => setOnline(true)
    const offlineHandler = () => setOnline(false)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    return () => { window.removeEventListener('online', onlineHandler); window.removeEventListener('offline', offlineHandler) }
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3_000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (loading) return
    if (draft) void setPreference('captureDraft', JSON.stringify(draft))
    else void deletePreference('captureDraft')
  }, [draft, loading])

  useEffect(() => { const timer = window.setInterval(() => setClockNow(Date.now()), 5000); return () => window.clearInterval(timer) }, [])

  const locate = useCallback((onSuccess?: (coordinate: Coordinate) => void, moveMap = false) => {
    const generation = captureGeneration.current
    setLocationBusy(true)
    setLocationMessage('Finding phone position…')
    void getDevicePosition().then((coordinate) => {
      setCurrentPosition(coordinate)
      if (moveMap) setLocateRequest((request) => request + 1)
      setLocationMessage(`Device position ${formatAccuracy(coordinate.accuracy)}`)
      if (generation === captureGeneration.current) onSuccess?.(coordinate)
    }).catch((error) => setLocationMessage(String(error).toLowerCase().includes('permission') ? 'Location permission denied — tap the map instead' : 'Could not get a fresh position — retry or place manually')).finally(() => setLocationBusy(false))
  }, [])

  useEffect(() => {
    if (view === 'map' && activeProjectId && !currentPosition && locationMessage === 'Location not requested') queueMicrotask(() => locate())
  }, [activeProjectId, currentPosition, locate, locationMessage, view])

  useEffect(() => {
    const isTracking = draft?.mode === 'route' && !draft.paused && !formOpen
    if (!isTracking) {
      routeWatch.current?.()
      routeWatch.current = null
      return
    }
    let cancelled = false
    void startDevicePositionWatch(
      (coordinate) => {
        if (!validPosition(coordinate) || Date.now() - coordinate.timestamp > 30_000) return
        setCurrentPosition(coordinate)
        setLocationMessage(`Tracking · device estimate ${formatAccuracy(coordinate.accuracy)}`)
        setDraft((current) => {
          if (!current || current.mode !== 'route' || current.paused) return current
          const last = current.coordinates.at(-1)
          if (last && coordinate.timestamp <= last.timestamp) return current
          if (last && distanceMetres(last, coordinate) < 2 && coordinate.timestamp - last.timestamp < 5_000) return current
          return { ...current, coordinates: [...current.coordinates, coordinate] }
        })
      },
      (error) => setLocationMessage(String(error).toLowerCase().includes('permission') ? 'Location permission is required for route tracking' : 'Waiting for a usable GPS position…'),
    ).then((stop) => { if (cancelled) stop(); else routeWatch.current = stop }).catch((error) => setLocationMessage(String(error).toLowerCase().includes('permission') ? 'Location permission is required for route tracking' : 'Waiting for a usable GPS position…'))
    return () => { cancelled = true; routeWatch.current?.(); routeWatch.current = null }
  }, [draft?.mode, draft?.paused, formOpen])

  const selectProject = async (projectId: string) => { if (draft) { setView('map'); setToast('Finish or cancel the current capture first'); return } setActiveProjectId(projectId); setSelectedRecordIds([]); setLayersOpen(false); setMapView(null); await setPreference('activeProjectId', projectId); setView('map') }
  const createProject = async (project: Project) => { const hydrated = ensureProjectLayers(project); await saveProject(hydrated); await setPreference('activeProjectId', hydrated.id); setProjects((items) => [hydrated, ...items]); setActiveProjectId(hydrated.id); setMapView(null); setView('map'); setToast('Project created with a field layer workspace') }
  const removeProject = async (project: Project) => {
    if (!window.confirm(`Delete “${project.name}” and every record and image in it? This cannot be undone.`)) return
    await deleteProject(project.id)
    const remaining = projects.filter((item) => item.id !== project.id)
    setProjects(remaining)
    setRecords((items) => items.filter((record) => record.projectId !== project.id))
    if (activeProjectId === project.id) {
      const nextId = remaining[0]?.id ?? ''
      setActiveProjectId(nextId)
      if (nextId) await setPreference('activeProjectId', nextId); else await deletePreference('activeProjectId')
    }
    setSelectedRecordIds([])
    setToast('Project and its local field data deleted')
  }
  const updateProject = async (project: Project) => { const hydrated = ensureProjectLayers(project); await saveProject(hydrated); setProjects((items) => items.map((item) => item.id === hydrated.id ? hydrated : item)); setToast('Project settings saved') }
  const chooseBasemap = async (nextBasemap: BasemapId) => { setBasemap(nextBasemap); await setPreference('basemap', nextBasemap) }

  const persistLayerProject = async (nextProject: Project) => {
    const hydrated = ensureProjectLayers({ ...nextProject, updatedAt: new Date().toISOString() })
    setProjects((items) => items.map((item) => item.id === hydrated.id ? hydrated : item))
    await saveProject(hydrated)
  }
  const setActiveLayer = (layerId: string) => {
    if (!activeProject) return
    const layer = activeLayers.find((item) => item.id === layerId)
    if (!layer) return
    void persistLayerProject({ ...activeProject, activeLayerId: layerId })
  }
  const updateLayer = (layer: ProjectLayer) => {
    if (!activeProject) return
    void persistLayerProject({ ...activeProject, layers: activeLayers.map((item) => item.id === layer.id ? layer : item) })
  }
  const addLayer = (name: string, geometryType: CollectionMode, group: string) => {
    if (!activeProject) return
    const layer = { ...createProjectLayer(activeProject.id, name, geometryType, group), order: activeLayers.length }
    void persistLayerProject({ ...activeProject, layers: [...activeLayers, layer], activeLayerId: layer.id })
    setToast(`${layer.name} is now the active collection layer`)
  }
  const deleteLayerFromProject = (layerId: string) => {
    if (!activeProject || projectRecords.some((record) => record.layerId === layerId)) return
    const layers = activeLayers.filter((layer) => layer.id !== layerId).map((layer, order) => ({ ...layer, order }))
    void persistLayerProject({ ...activeProject, layers, activeLayerId: activeProject.activeLayerId === layerId ? layers[0]?.id : activeProject.activeLayerId })
  }
  const moveLayer = (layerId: string, direction: -1 | 1) => {
    if (!activeProject) return
    const layers = orderedLayers(activeLayers)
    const index = layers.findIndex((layer) => layer.id === layerId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= layers.length) return
    ;[layers[index], layers[target]] = [layers[target], layers[index]]
    void persistLayerProject({ ...activeProject, layers: layers.map((layer, order) => ({ ...layer, order })) })
  }

  const beginCapture = (mode: CollectionMode, requestedLayer?: ProjectLayer, projectLayers = activeLayers) => {
    if (draft) { setToast('Finish or cancel the current capture first'); return }
    captureGeneration.current++
    setMenuOpen(false); setView('map'); setEditingRecordId(null)
    const targetLayer = requestedLayer?.geometryType === mode && !requestedLayer.locked
      ? requestedLayer
      : activeLayer?.geometryType === mode && !activeLayer.locked ? activeLayer : layerForMode(projectLayers, mode)
    if (!targetLayer) { setToast(`Create an unlocked ${MODE_LABELS[mode].toLowerCase()} layer before collecting`); return }
    if (activeProject) void persistLayerProject({ ...activeProject, layers: projectLayers, activeLayerId: targetLayer.id })
    setCaptureLayerId(targetLayer.id)
    setLineDrawing(false)
    const nextDraft: CaptureDraft = { projectId: activeProjectId, mode, layerId: targetLayer.id, coordinates: [], startedAt: new Date().toISOString(), paused: false }
    setDraft(nextDraft); setFormOpen(false)
    if (mode === 'route') { setLocationMessage('Starting route tracking…'); return }
    locate((coordinate) => {
      if (mode === 'point') { setDraft({ ...nextDraft, coordinates: [coordinate] }); setFormOpen(true) }
    })
  }

  const persistCollectionDefinitions = (definitions: CollectionDefinition[]) => {
    const ordered = [...definitions].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    setCollectionDefinitions(ordered)
    void setPreference('collectionLibrary', JSON.stringify(ordered))
  }
  const rememberDefinition = (definition: CollectionDefinition) => {
    const remembered = { ...definition, lastUsedAt: new Date().toISOString() }
    persistCollectionDefinitions([
      remembered,
      ...collectionDefinitions.filter((item) => item.id !== remembered.id),
    ])
    return remembered
  }
  const collectDefinition = (definition: CollectionDefinition) => {
    if (!activeProject) return
    const remembered = rememberDefinition(definition)
    const existing = activeLayers.find((layer) => layer.collectionDefinitionId === remembered.id && layer.geometryType === remembered.geometryType)
    const targetLayer = existing ?? definitionToProjectLayer(activeProject.id, remembered, activeLayers.length)
    const projectLayers = existing ? activeLayers : [...activeLayers, targetLayer]
    beginCapture(remembered.geometryType, targetLayer, projectLayers)
  }
  const removeCollectionDefinition = (definition: CollectionDefinition) => {
    if (!window.confirm(`Forget “${definition.name}” from your reusable collection library? Existing project layers and features will be kept.`)) return
    persistCollectionDefinitions(collectionDefinitions.filter((item) => item.id !== definition.id))
    setToast(`${definition.name} removed from the reusable library`)
  }

  const addMapPoint = (coordinate: Coordinate) => {
    if (draft?.mode === 'route' && !editingRecordId) return
    captureGeneration.current++
    setDraft((current) => {
      if (!current) return current
      if (current.mode === 'point') {
        if (!editingRecordId) window.setTimeout(() => setFormOpen(true), 0)
        return { ...current, coordinates: [{ ...coordinate, source: 'manual' }] }
      }
      return { ...current, coordinates: [...current.coordinates, coordinate] }
    })
  }

  const moveDraftCoordinate = (index: number, coordinate: Coordinate) => {
    setDraft((current) => current ? { ...current, coordinates: current.coordinates.map((item, itemIndex) => itemIndex === index ? coordinate : item) } : current)
  }

  const editRecordGeometry = (record: FieldRecord) => {
    if (activeLayers.find(layer => layer.id === record.layerId)?.locked) { setToast('Unlock this layer before editing'); return }
    captureGeneration.current++
    setLineDrawing(false)
    setEditingRecordId(record.id)
    setCaptureLayerId(record.layerId)
    setDraft({ projectId: record.projectId, mode: record.mode, layerId: record.layerId, editingRecordId: record.id, coordinates: record.coordinates.map((coordinate) => ({ ...coordinate })), startedAt: new Date().toISOString(), paused: true })
    setFormOpen(false)
    setView('map')
    setToast('Drag positions to move them, or tap the map to add another')
  }

  const addCurrentPosition = () => locate((coordinate) => setDraft((current) => current ? { ...current, coordinates: [...current.coordinates, coordinate] } : current))
  const finishDraft = async () => {
    if (!draft) return
    const issue = geometryIssue(draft.mode, draft.coordinates)
    if (issue) { setToast(issue); return }
    if (editingRecordId) {
      const existing = records.find((record) => record.id === editingRecordId)
      if (!existing) { setToast('The record could not be found'); return }
      const updated = { ...existing, geometryHistory: [...(existing.geometryHistory ?? []), { changedAt: new Date().toISOString(), operative: profile.name, coordinates: existing.coordinates }], coordinates: draft.coordinates, updatedAt: new Date().toISOString(), syncStatus: 'local' as const }
      await saveRecord(updated)
      setRecords((items) => items.map((record) => record.id === updated.id ? updated : record))
      setEditingRecordId(null)
      discardDraft()
      setToast('Geometry updated safely on this device')
      return
    }
    captureGeneration.current++
    setFormOpen(true)
  }
  const discardDraft = useCallback(() => { captureGeneration.current++; setDraft(null); setLineDrawing(false); setFormOpen(false); setEditingRecordId(null); setCaptureLayerId(undefined); setLocationMessage(currentPosition ? `Device position ${formatAccuracy(currentPosition.accuracy)}` : 'Location not requested') }, [currentPosition])
  const commitRecord = async (record: FieldRecord) => { const layered = { ...record, layerId: record.layerId ?? captureLayerId }; await saveRecord(layered); setRecords((items) => [layered, ...items]); discardDraft(); setToast('Feature logged safely to its project layer') }
  const commitImportedRecords = async (importedRecords: FieldRecord[]) => {
    const layeredRecords = activeProject ? importedRecords.map((record) => assignRecordLayer(record, activeProject)) : importedRecords
    await saveRecords(layeredRecords); setRecords((items) => [...layeredRecords, ...items]); setImportOpen(false); setToast(`${layeredRecords.length} imported features organised into project layers`)
  }

  const removeRecord = async (record: FieldRecord) => {
    if (!window.confirm(`Delete “${record.label}”${record.attachments.length ? ` and its ${record.attachments.length} image(s)` : ''}?`)) return
    await deleteRecord(record.id)
    setRecords((items) => items.filter((item) => item.id !== record.id))
    setSelectedRecordIds((items) => items.filter((id) => id !== record.id))
    setToast('Record deleted')
  }
  const removeAttachment = async (record: FieldRecord, attachmentId: string) => {
    if (!window.confirm('Remove this image from the record?')) return
    const updated = { ...record, attachments: record.attachments.filter((attachment) => attachment.id !== attachmentId), updatedAt: new Date().toISOString(), syncStatus: 'local' as const }
    await saveRecord(updated)
    setRecords((items) => items.map((item) => item.id === updated.id ? updated : item))
    setToast('Image removed')
  }
  const saveStyledRecord = async (record: FieldRecord) => { await saveRecord(record); setRecords((items) => items.map((item) => item.id === record.id ? record : item)); setStylingRecord(null); setToast('Map style updated') }
  const saveFeatureAttributes = async (record: FieldRecord) => { await saveRecord(record); setRecords((items) => items.map((item) => item.id === record.id ? record : item)); setEditingAttributes(null); setToast('Feature attributes updated') }
  const saveProfile = async (nextProfile: UserProfile, nextTheme: ThemePreference, nextWeatherInOutputs: boolean) => { setProfile(nextProfile); setTheme(nextTheme); setWeatherInOutputs(nextWeatherInOutputs); await Promise.all([setPreference('userProfile', JSON.stringify(nextProfile)), setPreference('theme', nextTheme), setPreference('weatherInOutputs', String(nextWeatherInOutputs))]); setToast('Settings saved') }
  const keyInPoint = (coordinate: Coordinate) => {
    const targetLayer = activeLayer?.geometryType === 'point' && !activeLayer.locked ? activeLayer : layerForMode(activeLayers, 'point')
    if (!targetLayer) { setToast('Create an unlocked point layer first'); return }
    captureGeneration.current++
    const nextDraft: CaptureDraft = { projectId: activeProjectId, mode: 'point', layerId: targetLayer.id, coordinates: [coordinate], startedAt: new Date().toISOString(), paused: true }
    setActiveLayer(targetLayer.id); setCaptureLayerId(targetLayer.id); setKeyInOpen(false); setMapToolsOpen(false); setDraft(nextDraft); setEditingRecordId(null); setFormOpen(true)
  }
  const toggleRecordSelection = (recordId: string) => setSelectedRecordIds((items) => items.includes(recordId) ? items.filter((id) => id !== recordId) : [...items, recordId])
  const loadWeather = async () => {
    setWeatherError('')
    setWeatherBusy(true)
    try {
      const position = currentPosition ?? await getDevicePosition()
      if (!currentPosition) setCurrentPosition(position)
      setWeather(await getLiveWeather(position))
    } catch (cause) { setWeatherError(cause instanceof Error ? cause.message : 'Live weather could not be loaded.') }
    finally { setWeatherBusy(false) }
  }
  const openExport = () => {
    setExportOpen(true)
    const weatherIsStale = !weather || Date.now() - new Date(weather.capturedAt).getTime() > 15 * 60_000
    if (weatherInOutputs && weatherIsStale && !weatherBusy) void loadWeather()
  }

  const draftMeasurement = draft?.mode === 'area' ? formatArea(polygonAreaSquareMetres(draft.coordinates)) : draft && (draft.mode === 'line' || draft.mode === 'route') ? formatDistance(lineLengthMetres(draft.coordinates)) : null
  const currentAccuracy = accuracyQuality(currentPosition?.accuracy)
  const selectedRecords = projectRecords.filter((record) => selectedRecordIds.includes(record.id))
  const captureLayer = activeLayers.find((layer) => layer.id === captureLayerId)
  const usedLabels = new Set(projectRecords.map(record => record.label))
  let labelIndex = projectRecords.filter(record => record.layerId === captureLayerId).length
  while (usedLabels.has(nextFeatureLabel(captureLayer, labelIndex))) labelIndex++
  const suggestedRecordLabel = nextFeatureLabel(captureLayer, labelIndex)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | undefined
    void NativeApp.addListener('backButton', () => {
      if (surveyToolsOpen) { setSurveyToolsOpen(false); return }
      if (editingAttributes) { setEditingAttributes(null); return }
      if (stylingRecord) { setStylingRecord(null); return }
      if (keyInOpen) { setKeyInOpen(false); return }
      if (exportOpen) { setExportOpen(false); return }
      if (importOpen) { setImportOpen(false); return }
      if (formOpen || draft) { discardDraft(); return }
      if (menuOpen) { setMenuOpen(false); return }
      if (mapToolsOpen) { setMapToolsOpen(false); return }
      if (layersOpen) { setLayersOpen(false); return }
      if (selectedRecordIds.length) { setSelectedRecordIds([]); return }
      if (view !== 'projects') { setView('projects'); return }
      void NativeApp.exitApp()
    }).then((handle) => { remove = () => { void handle.remove() } })
    return () => remove?.()
  }, [surveyToolsOpen, discardDraft, draft, editingAttributes, exportOpen, formOpen, importOpen, keyInOpen, layersOpen, mapToolsOpen, menuOpen, selectedRecordIds.length, stylingRecord, view])

  if (loading) return <div className="app-loading"><span className="brand-mark"><Crosshair /></span><strong>Preparing FieldNote</strong><small>Opening your offline workspace…</small></div>

  return (
    <div className="app-shell">
      <header className="app-header">
        <button type="button" className="brand" onClick={() => draft ? setToast('Finish or cancel the current capture first') : setView('projects')}><span className="brand-mark"><Crosshair size={21} /></span><span><strong>FieldNote</strong><small>Field mapping</small></span></button>
        <div className="header-context"><small>Active project</small><strong>{activeProject?.name ?? 'No project selected'}</strong></div>
        <div className={`connection-pill ${online ? '' : 'offline'}`}>{online ? <Signal size={15} /> : <WifiOff size={15} />}<span>{online ? 'Online · saved locally' : 'Offline · data safe'}</span></div>
      </header>

      <div className="app-content">
        {view === 'projects' && <ProjectsView projects={projects} records={records} activeProjectId={activeProjectId} onOpen={selectProject} onCreate={createProject} onDelete={removeProject} />}
        {view === 'map' && (
          <main className="map-page">
            <FieldMap records={editingRecordId ? visibleProjectRecords.filter((record) => record.id !== editingRecordId) : visibleProjectRecords} layers={activeLayers} currentPosition={currentPosition} draft={draft} onMapPoint={addMapPoint} onDraftCoordinateMove={moveDraftCoordinate} basemap={basemap} editing={Boolean(editingRecordId)} selectedRecordIds={selectedRecordIds} onRecordSelect={toggleRecordSelection} locateRequest={locateRequest} fitRequest={fitRequest} drawing={lineDrawing && draft?.mode === 'line'} initialView={mapView} onViewChange={setMapView} />
            <div className="map-topbar"><div><small>{activeProject?.code ?? 'No project'}</small><strong>{activeProject?.name ?? 'Choose a project'}</strong><span className="active-layer-chip"><i style={{ background: activeLayer?.style.color ?? '#31c4d6' }}/>{activeLayer?.name ?? 'No active layer'}{activeLayer?.code ? ` · ${activeLayer.code}` : ''}</span></div><button type="button" className="map-icon-button" disabled={locationBusy} onClick={() => locate(undefined, true)} aria-label="Find my location"><LocateFixed size={21} /></button></div>
            <div className={`gps-status accuracy-${currentAccuracy.quality} ${locationMessage.includes('denied') || locationMessage.includes('Could not') ? 'warning' : ''}`}><span /><strong>{currentPosition && clockNow - currentPosition.timestamp > 30_000 && !locationBusy ? 'Position is stale · refresh location' : locationMessage}</strong>{currentPosition?.accuracy !== undefined && <small>{currentAccuracy.label} · phone location estimate</small>}</div>
            <button type="button" className={`basemap-button ${layersOpen ? 'active' : ''}`} onClick={() => { setLayersOpen((open) => !open); setMapToolsOpen(false) }} aria-label="Project layers"><Layers3 size={20} /><span>{activeLayers.filter((layer) => layer.visible).length}</span></button>
            <button type="button" className="map-tools-button" onClick={() => { setMapToolsOpen((open) => !open); setLayersOpen(false) }} aria-label="Map tools"><Wrench size={20} /></button>
            {mapToolsOpen && <section className="map-tools-menu" aria-label="Map tools">
              <div className="map-tools-drawer-head"><span><small>FIELD MAP</small><strong>Tools</strong></span><button type="button" className="map-tools-close" onClick={() => setMapToolsOpen(false)} aria-label="Close map tools"><X size={19}/></button></div>
              <button className="map-tool-action" type="button" onClick={() => { setFitRequest((request) => request + 1); setMapToolsOpen(false) }}><Maximize2 size={18}/><span><b>Zoom to project extent</b><small>Fit all job geometry on screen</small></span></button>
              <button className="map-tool-action" type="button" onClick={() => { locate(undefined, true); setMapToolsOpen(false) }}><LocateFixed size={18}/><span><b>Zoom to my location</b><small>Move the map only when requested</small></span></button>
              <button className="map-tool-action" type="button" onClick={() => { setSurveyToolsOpen(true); setMapToolsOpen(false) }}><Crosshair size={18}/><span><b>Distance & bearing</b><small>Find a point or compare recorded points</small></span></button>
              <button className="map-tool-action" type="button" disabled={Boolean(draft)} onClick={() => setKeyInOpen(true)}><Keyboard size={18}/><span><b>Key in point</b><small>Longitude / latitude entry</small></span></button>
              <button className="map-tool-action" type="button" disabled={Boolean(draft)} onClick={() => { setImportOpen(true); setMapToolsOpen(false) }}><Plus size={18}/><span><b>Import layer</b><small>CSV, KML or zipped Shapefile</small></span></button>
              <details className="tool-section"><summary>Weather <small>Optional · needs internet</small></summary><div className="weather-module"><div className="weather-module-head"><CloudSun size={19}/><span><b>Live field weather</b><small>Uses this device position via Open-Meteo</small></span></div>{weather ? <div className="weather-reading"><strong>{weather.temperature.toFixed(1)}°</strong><span>{weatherLabel(weather.weatherCode)}<small>Feels {weather.apparentTemperature.toFixed(1)}° · Wind {weather.windSpeed.toFixed(0)} km/h · Gusts {weather.windGusts.toFixed(0)} km/h</small><small>Humidity {weather.relativeHumidity}% · Rain {weather.precipitation} mm · Cloud {weather.cloudCover}%</small></span></div> : <p>No weather snapshot loaded.</p>}{weatherError && <small className="weather-error">{weatherError}</small>}<button type="button" className="weather-load" onClick={loadWeather} disabled={weatherBusy}>{weatherBusy ? <RefreshCw className="spin" size={16}/> : <CloudSun size={16}/>} {weatherBusy ? 'Loading…' : weather ? 'Refresh weather' : 'Load live weather'}</button></div></details>
              <button className="map-tool-action" type="button" onClick={() => { setSelectedRecordIds([]); setMapToolsOpen(false) }}><X size={18}/><span><b>Clear selection</b><small>{selectedRecordIds.length} currently selected</small></span></button>
            </section>}
            {layersOpen && activeProject && <LayerPanel key={activeProject.activeLayerId} layers={activeLayers} records={projectRecords} activeLayerId={activeProject.activeLayerId} basemap={basemap} onClose={() => setLayersOpen(false)} onSetActive={setActiveLayer} onUpdate={updateLayer} onAdd={addLayer} onDelete={deleteLayerFromProject} onMove={moveLayer} onBasemap={chooseBasemap}/>} 
            {!draft && <button type="button" className="collect-button" disabled={!activeProject} onClick={() => setMenuOpen(true)}><Plus size={23} strokeWidth={2.5} /> Collect</button>}
            {draft && !formOpen && (
              <section className="capture-panel" aria-label={`Collecting ${MODE_LABELS[draft.mode]}`}>
                <div className="capture-panel-head"><div><span className="recording-dot" /><span><small>{editingRecordId ? 'Editing geometry' : draft.mode === 'route' && !draft.paused ? 'Recording' : 'Collecting'}</small><strong>{MODE_LABELS[draft.mode]}</strong></span></div><button type="button" className="icon-button" onClick={discardDraft} aria-label="Cancel capture"><X size={20} /></button></div>
                <div className="capture-live-stats"><div><strong>{draft.coordinates.length}</strong><small>positions</small></div>{draftMeasurement && <div><strong>{draftMeasurement}</strong><small>{draft.mode === 'area' ? 'area' : 'distance'}</small></div>}<div><strong>{formatAccuracy(currentPosition?.accuracy)}</strong><small>device estimate</small></div></div>
                <p className="capture-instruction">{editingRecordId ? 'Drag any numbered position to move it. Tap the map to add a position; Undo removes the last one.' : draft.mode === 'route' ? (draft.paused ? 'Tracking is paused and background location has stopped.' : (Capacitor.isNativePlatform() ? 'Recording your route. Pause or finish before leaving the job.' : 'Keep this browser open and the screen awake. Browser tracking may stop in the background.')) : draft.mode === 'point' ? 'Waiting for the device position, or tap the map to place it manually.' : draft.mode === 'line' && lineDrawing ? 'Draw directly on the map with your finger. Switch to Pan when you need to move the map.' : 'Tap the map to add vertices, or use your live device position.'}</p>
                <div className="capture-actions">{!editingRecordId && draft.mode === 'route' ? <button type="button" className="capture-secondary" onClick={() => setDraft({ ...draft, paused: !draft.paused })}>{draft.paused ? <Play size={19} /> : <Pause size={19} />}{draft.paused ? 'Resume' : 'Pause'}</button> : !editingRecordId && draft.mode === 'line' ? <button type="button" className={`capture-secondary ${lineDrawing ? 'active' : ''}`} onClick={() => setLineDrawing((drawing) => !drawing)}><PencilLine size={19}/>{lineDrawing ? 'Drawing · tap for Pan' : 'Pan · tap to Draw'}</button> : !editingRecordId ? <button type="button" className="capture-secondary" disabled={locationBusy} onClick={addCurrentPosition}><LocateFixed size={19} /> Add GPS</button> : <span className="capture-edit-hint">Manual edit</span>}{draft.mode === 'line' && !editingRecordId && <button type="button" className="capture-icon" disabled={locationBusy} onClick={addCurrentPosition} aria-label="Add GPS vertex"><LocateFixed size={19}/></button>}{(draft.mode !== 'route' || editingRecordId) && <button type="button" className="capture-icon" disabled={draft.coordinates.length === 0} onClick={() => setDraft({ ...draft, coordinates: draft.coordinates.slice(0, -1) })} aria-label="Undo last position"><Undo2 size={19} /></button>}<button type="button" className="capture-finish" onClick={finishDraft}><Save size={19} /> {editingRecordId ? 'Save edit' : 'Finish'}</button></div>
              </section>
            )}
            {!draft && selectedRecords.length > 0 && <section className="map-selection-panel"><div className="selection-head"><div><small>Selected features</small><strong>{selectedRecords.length === 1 ? selectedRecords[0].label : `${selectedRecords.length} selected`}</strong></div><button type="button" className="icon-button" onClick={() => setSelectedRecordIds([])}><X size={18}/></button></div>{selectedRecords.length > 1 && <div className="selection-list">{selectedRecords.map((record) => <button type="button" key={record.id} onClick={() => setSelectedRecordIds([record.id])}><span className={`selection-symbol mode-${record.mode}`}/><span><strong>{record.label}</strong><small>{activeLayers.find((layer) => layer.id === record.layerId)?.name ?? record.category} · {record.mode}</small></span></button>)}</div>}{selectedRecords.length === 1 && <><div className="selected-layer-path"><Layers3 size={14}/>{activeLayers.find((layer) => layer.id === selectedRecords[0].layerId)?.group ?? 'Field data'} / <strong>{activeLayers.find((layer) => layer.id === selectedRecords[0].layerId)?.name ?? 'Unassigned'}</strong></div><p>{selectedRecords[0].notes || 'No notes were added.'}</p>{selectedRecords[0].attributes && Object.keys(selectedRecords[0].attributes).length > 0 && <dl className="selected-attributes">{Object.entries(selectedRecords[0].attributes).slice(0, 4).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value ?? '')}</dd></div>)}</dl>}<div className="selection-actions"><button type="button" onClick={() => setEditingAttributes(selectedRecords[0])}><TableProperties size={15}/> Attributes</button><button type="button" onClick={() => editRecordGeometry(selectedRecords[0])}>Geometry</button><button type="button" onClick={() => setStylingRecord(selectedRecords[0])}>Style override</button><button type="button" className="danger" onClick={() => removeRecord(selectedRecords[0])}><Trash2 size={15}/> Delete</button></div></>}</section>}
          </main>
        )}
        {view === 'records' && <RecordsView records={projectRecords} layers={activeLayers} project={activeProject} onImportRequested={() => setImportOpen(true)} onExportRequested={openExport} onEditRecord={editRecordGeometry} onEditAttributes={setEditingAttributes} onDeleteRecord={removeRecord} onDeleteAttachment={removeAttachment} onStyleRecord={setStylingRecord} />}
        {view === 'settings' && <SettingsView key={activeProject?.id ?? 'no-project'} profile={profile} theme={theme} weatherInOutputs={weatherInOutputs} project={activeProject} onSaveProfile={saveProfile} onSaveProject={updateProject} />}
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation"><button type="button" className={view === 'projects' ? 'active' : ''} onClick={() => draft ? setToast('Finish or cancel the current capture first') : setView('projects')}><FolderKanban size={21} /><span>Projects</span></button><button type="button" className={view === 'map' ? 'active' : ''} onClick={() => activeProject ? setView('map') : setToast('Choose or create a project first')}><MapIcon size={21} /><span>Map</span></button><button type="button" disabled={Boolean(draft)} className={view === 'records' ? 'active' : ''} onClick={() => activeProject ? setView('records') : setToast('Choose or create a project first')}><ClipboardList size={21} /><span>Records</span></button><button type="button" disabled={Boolean(draft)} className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings size={21}/><span>Settings</span></button></nav>
      <CollectionMenu open={menuOpen} layers={activeLayers} definitions={collectionDefinitions} activeLayerId={activeProject?.activeLayerId} onClose={() => setMenuOpen(false)} onCollectLayer={(layer) => beginCapture(layer.geometryType, layer)} onCollectDefinition={collectDefinition} onSaveAndCollect={collectDefinition} onRemoveDefinition={removeCollectionDefinition} />
      {surveyToolsOpen && <SurveyTools records={projectRecords} position={currentPosition} onLocate={() => locate()} onClose={() => setSurveyToolsOpen(false)}/>}
      {formOpen && draft && <RecordForm draft={draft} projectId={draft.projectId} layerId={captureLayerId} layerName={captureLayer?.name} featureCode={captureLayer?.code} suggestedLabel={suggestedRecordLabel} currentPosition={currentPosition} operative={profile.name || 'Field operative'} onCancel={discardDraft} onSave={commitRecord} />}
      {keyInOpen && activeProject && <KeyInPointSheet project={activeProject} onClose={() => setKeyInOpen(false)} onCoordinate={keyInPoint} />}
      {stylingRecord && <RecordStyleSheet record={stylingRecord} onClose={() => setStylingRecord(null)} onSave={saveStyledRecord} />}
      {editingAttributes && <FeatureEditorSheet record={editingAttributes} layers={activeLayers} onClose={() => setEditingAttributes(null)} onSave={saveFeatureAttributes}/>} 
      <Suspense fallback={<div className="toast" role="status">Opening tools…</div>}>
        {importOpen && activeProject && <ImportDataSheet projectId={activeProject.id} existingRecords={projectRecords} defaultCrs={activeProject.coordinateSystem} onClose={() => setImportOpen(false)} onImport={commitImportedRecords} />}
        {exportOpen && activeProject && <ExportDataSheet project={activeProject} records={projectRecords} profile={profile} weather={weather} weatherInOutputs={weatherInOutputs} onClose={() => setExportOpen(false)} />}
      </Suspense>
      {toast && <div className="toast"><RotateCcw size={17} />{toast}</div>}
    </div>
  )
}

export default App
