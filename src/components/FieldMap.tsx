import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { CaptureDraft, Coordinate, FieldRecord, ProjectLayer, RecordStyle } from '../types'
import { BASEMAPS, type BasemapId } from '../lib/basemaps'
import { effectiveRecordStyle } from '../lib/layers'

type FieldMapProps = {
  records: FieldRecord[]
  layers?: ProjectLayer[]
  currentPosition: Coordinate | null
  draft: CaptureDraft | null
  onMapPoint: (coordinate: Coordinate) => void
  onDraftCoordinateMove: (index: number, coordinate: Coordinate) => void
  basemap: BasemapId
  editing?: boolean
  selectedRecordIds?: string[]
  onRecordSelect?: (recordId: string) => void
  locateRequest?: number
  fitRequest?: number
  drawing?: boolean
  initialView?: { latitude: number; longitude: number; zoom: number } | null
  onViewChange?: (view: { latitude: number; longitude: number; zoom: number }) => void
}

function recordIcon(selected: boolean, style: RecordStyle) {
  const color = style.color ?? '#31c4d6'
  const outline = style.outlineColor ?? '#ffffff'
  const outlineWidth = style.outlineWidth ?? 3
  const symbol = style.symbol ?? 'pin'
  return L.divIcon({
    className: `field-marker-wrap ${selected ? 'selected' : ''}`,
    html: `<span class="field-marker symbol-${symbol}" style="--marker-color:${color};--marker-outline:${outline};--marker-outline-width:${outlineWidth}px"><span></span></span>`,
    iconSize: [26, 31],
    iconAnchor: [13, 27],
  })
}

const vertexIcon = L.divIcon({
  className: 'draft-vertex-wrap',
  html: '<span class="draft-vertex"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

function MapEvents({ onMapPoint, draft, editing, drawing = false }: Pick<FieldMapProps, 'onMapPoint' | 'draft' | 'editing' | 'drawing'>) {
  const drawingRef = useRef(false)
  const lastDrawn = useRef<L.LatLng | null>(null)
  const map = useMapEvents({
    click(event) {
      if (drawing) return
      if (!draft || (draft.mode === 'route' && !editing)) return
      onMapPoint({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
        source: 'manual',
        timestamp: Date.now(),
      })
    },
  })
  useEffect(() => {
    const container = map.getContainer()
    if (!drawing || !draft || draft.mode !== 'line') { map.dragging.enable(); return }
    map.dragging.disable()
    const coordinate = (event: PointerEvent) => map.containerPointToLatLng(map.mouseEventToContainerPoint(event))
    const append = (latlng: L.LatLng) => onMapPoint({ latitude: latlng.lat, longitude: latlng.lng, source: 'manual', timestamp: Date.now() })
    const pointerDown = (event: PointerEvent) => {
      event.preventDefault()
      drawingRef.current = true
      container.setPointerCapture?.(event.pointerId)
      const latlng = coordinate(event)
      lastDrawn.current = latlng
      append(latlng)
    }
    const pointerMove = (event: PointerEvent) => {
      if (!drawingRef.current || !lastDrawn.current) return
      event.preventDefault()
      const latlng = coordinate(event)
      if (latlng.distanceTo(lastDrawn.current) < 1.25) return
      lastDrawn.current = latlng
      append(latlng)
    }
    const pointerUp = (event: PointerEvent) => { drawingRef.current = false; lastDrawn.current = null; if (container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture?.(event.pointerId) }
    container.addEventListener('pointerdown', pointerDown, { passive: false })
    container.addEventListener('pointermove', pointerMove, { passive: false })
    container.addEventListener('pointerup', pointerUp)
    container.addEventListener('pointercancel', pointerUp)
    return () => { map.dragging.enable(); container.removeEventListener('pointerdown', pointerDown); container.removeEventListener('pointermove', pointerMove); container.removeEventListener('pointerup', pointerUp); container.removeEventListener('pointercancel', pointerUp) }
  }, [draft, drawing, map, onMapPoint])
  return null
}

function MapCommands({ position, records, locateRequest = 0, fitRequest = 0 }: { position: Coordinate | null; records: FieldRecord[]; locateRequest?: number; fitRequest?: number }) {
  const map = useMap()

  useEffect(() => {
    if (!locateRequest) return
    if (position) map.flyTo([position.latitude, position.longitude], Math.max(map.getZoom(), 17))
    // Only explicit location requests change the user's current map view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, locateRequest])

  useEffect(() => {
    if (!fitRequest) return
    const coordinates = records.flatMap((record) => record.coordinates)
    if (!coordinates.length) return
    map.fitBounds(coordinates.map((coordinate) => [coordinate.latitude, coordinate.longitude] as [number, number]), { padding: [32, 32], maxZoom: 18 })
    // Only explicit extent requests change the user's current map view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitRequest])

  return null
}

function ViewMemory({ onViewChange }: { onViewChange?: FieldMapProps['onViewChange'] }) {
  const map = useMapEvents({
    moveend() { const centre = map.getCenter(); onViewChange?.({ latitude: centre.lat, longitude: centre.lng, zoom: map.getZoom() }) },
    zoomend() { const centre = map.getCenter(); onViewChange?.({ latitude: centre.lat, longitude: centre.lng, zoom: map.getZoom() }) },
  })
  return null
}

const positions = (coordinates: Coordinate[]) =>
  coordinates.map((coordinate) => [coordinate.latitude, coordinate.longitude] as [number, number])

function LinearFeature({ record, style, selected, recordPositions, eventHandlers }: { record: FieldRecord; style: RecordStyle; selected: boolean; recordPositions: [number, number][]; eventHandlers: { click: (event: L.LeafletMouseEvent) => void } }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useEffect(() => { const update = () => setZoom(map.getZoom()); map.on('zoomend', update); return () => { map.off('zoomend', update) } }, [map])
  const color = style.color ?? (record.mode === 'route' ? '#111111' : '#31c4d6')
  const outline = style.outlineColor ?? '#ffffff'
  const outlineWidth = style.outlineWidth ?? 1
  const baseWidth = style.lineWidth ?? 3
  const zoomFactor = style.autoScale === false ? 1 : Math.max(.68, Math.min(1.55, 1 + (zoom - 16) * .1))
  const width = baseWidth * zoomFactor + (selected ? 2 : 0)
  return <><Polyline positions={recordPositions} pathOptions={{ color: outline, weight: width + outlineWidth * 2, opacity: 1, lineCap: 'round', lineJoin: 'round' }}/><Polyline positions={recordPositions} eventHandlers={eventHandlers} pathOptions={{ color, weight: width, opacity: selected ? 1 : .9, dashArray: record.mode === 'route' ? '12 8' : undefined, lineCap: 'round', lineJoin: 'round' }}/></>
}

export function FieldMap({ records, layers = [], currentPosition, draft, onMapPoint, onDraftCoordinateMove, basemap, editing = false, selectedRecordIds = [], onRecordSelect, locateRequest = 0, fitRequest = 0, drawing = false, initialView = null, onViewChange }: FieldMapProps) {
  const selectedBasemap = BASEMAPS[basemap] ?? BASEMAPS.streets
  const projectCoordinates = records.flatMap((record) => record.coordinates)
  const projectCentre = projectCoordinates.length ? { latitude: projectCoordinates.reduce((sum, item) => sum + item.latitude, 0) / projectCoordinates.length, longitude: projectCoordinates.reduce((sum, item) => sum + item.longitude, 0) / projectCoordinates.length } : null
  const centre = initialView ? ([initialView.latitude, initialView.longitude] as [number, number]) : projectCentre ? ([projectCentre.latitude, projectCentre.longitude] as [number, number]) : ([60.3929, 5.3087] as [number, number])

  return (
    <MapContainer center={centre} zoom={initialView?.zoom ?? (projectCoordinates.length ? 16 : 12)} zoomControl={false} attributionControl className="field-map">
      {selectedBasemap.url && <TileLayer key={selectedBasemap.id} attribution={selectedBasemap.attribution} url={selectedBasemap.url} maxZoom={selectedBasemap.maxZoom} />}
      <MapEvents onMapPoint={onMapPoint} draft={draft} editing={editing} drawing={drawing} />
      <MapCommands position={currentPosition} records={records} locateRequest={locateRequest} fitRequest={fitRequest} />
      <ViewMemory onViewChange={onViewChange} />

      {records.map((record) => {
        const recordPositions = positions(record.coordinates)
        const selected = selectedRecordIds.includes(record.id)
        const style = effectiveRecordStyle(record, layers)
        const color = style.color ?? (record.mode === 'route' ? '#111111' : '#31c4d6')
        const outline = style.outlineColor ?? '#ffffff'
        const eventHandlers = { click: (event: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(event.originalEvent); onRecordSelect?.(record.id) } }
        if (recordPositions.length === 0) return null
        if (record.mode === 'area' && recordPositions.length >= 3) {
          return <Polygon key={record.id} positions={recordPositions} eventHandlers={eventHandlers} pathOptions={{ color: outline, fillColor: color, fillOpacity: selected ? 0.4 : 0.2, weight: (style.outlineWidth ?? 2) + (selected ? 2 : 0) }} />
        }
        if ((record.mode === 'line' || record.mode === 'route') && recordPositions.length >= 2) {
          return <LinearFeature key={record.id} record={record} style={style} selected={selected} recordPositions={recordPositions} eventHandlers={eventHandlers} />
        }
        return (
          <Marker key={record.id} position={recordPositions[0]} icon={recordIcon(selected, style)} eventHandlers={eventHandlers}>
            {style.showLabel !== false && <Tooltip direction="top" offset={[style.labelOffsetX ?? 0, style.labelOffsetY ?? -24]} permanent={selected}>{record.label}</Tooltip>}
          </Marker>
        )
      })}

      {draft && draft.coordinates.length > 0 && draft.mode === 'area' && (
        <Polygon positions={positions(draft.coordinates)} pathOptions={{ color: '#31c4d6', weight: 2, dashArray: '7 6', fillOpacity: 0.16 }} />
      )}
      {draft && draft.coordinates.length > 0 && (draft.mode === 'line' || draft.mode === 'route') && (
        <Polyline positions={positions(draft.coordinates)} pathOptions={{ color: '#31c4d6', dashArray: '7 6', weight: 3 }} />
      )}
      {draft?.coordinates.map((coordinate, index) => (
        <Marker
          key={`${coordinate.timestamp}-${index}`}
          position={[coordinate.latitude, coordinate.longitude]}
          icon={vertexIcon}
          draggable
          eventHandlers={{
            dragend(event) {
              const position = event.target.getLatLng()
              onDraftCoordinateMove(index, {
                ...coordinate,
                latitude: position.lat,
                longitude: position.lng,
                accuracy: undefined,
                source: 'manual',
                timestamp: Date.now(),
              })
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -12]}>Drag position {index + 1}</Tooltip>
        </Marker>
      ))}
      {currentPosition && (
        <>
          {currentPosition.accuracy && (
            <Circle
              center={[currentPosition.latitude, currentPosition.longitude]}
              radius={currentPosition.accuracy}
              pathOptions={{ color: '#267dce', fillColor: '#55a5ea', fillOpacity: 0.12, weight: 1 }}
            />
          )}
          <Circle
            center={[currentPosition.latitude, currentPosition.longitude]}
            radius={3}
            pathOptions={{ color: 'white', fillColor: '#267dce', fillOpacity: 1, weight: 3 }}
          />
        </>
      )}
    </MapContainer>
  )
}
