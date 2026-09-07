import { useEffect } from 'react'
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { BASEMAPS, type BasemapId } from '../lib/basemaps'
import type { MapExtent } from '../lib/report'
import type { FieldRecord } from '../types'

type Props = { pageId: string; records: FieldRecord[]; basemap: BasemapId; extent?: MapExtent; primaryColor: string; secondaryColor: string; onExtentChange: (extent: MapExtent) => void }

const markerIcon = (color: string, outline: string) => L.divIcon({ className: 'mudmap-extent-marker-wrap', html: `<span style="--extent-marker:${color};--extent-outline:${outline}"></span>`, iconSize: [17, 17], iconAnchor: [8, 8] })
const positions = (record: FieldRecord) => record.coordinates.map((coordinate) => [coordinate.latitude, coordinate.longitude] as [number, number])

function Viewport({ records, extent, onExtentChange }: Pick<Props, 'records' | 'extent' | 'onExtentChange'>) {
  const map = useMap()
  useEffect(() => {
    if (extent) map.fitBounds([[extent.minLatitude, extent.minLongitude], [extent.maxLatitude, extent.maxLongitude]], { animate: false })
    else {
      const points = records.flatMap((record) => record.coordinates).map((coordinate) => [coordinate.latitude, coordinate.longitude] as [number, number])
      if (points.length) map.fitBounds(points, { padding: [38, 38], maxZoom: 19, animate: false })
    }
    const bounds = map.getBounds()
    onExtentChange({ minLongitude: bounds.getWest(), maxLongitude: bounds.getEast(), minLatitude: bounds.getSouth(), maxLatitude: bounds.getNorth() })
    // Page remounts when changing page, so initial framing runs once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])
  useMapEvents({
    moveend() { const bounds = map.getBounds(); onExtentChange({ minLongitude: bounds.getWest(), maxLongitude: bounds.getEast(), minLatitude: bounds.getSouth(), maxLatitude: bounds.getNorth() }) },
    zoomend() { const bounds = map.getBounds(); onExtentChange({ minLongitude: bounds.getWest(), maxLongitude: bounds.getEast(), minLatitude: bounds.getSouth(), maxLatitude: bounds.getNorth() }) },
  })
  return null
}

export function MudmapExtentMap({ pageId, records, basemap, extent, primaryColor, secondaryColor, onExtentChange }: Props) {
  const layer = BASEMAPS[basemap]
  const first = records.flatMap((record) => record.coordinates)[0]
  return <div className="extent-touch-map"><MapContainer key={pageId} center={first ? [first.latitude, first.longitude] : [60.3929, 5.3087]} zoom={first ? 16 : 10} zoomControl attributionControl touchZoom dragging scrollWheelZoom doubleClickZoom className="extent-leaflet-map">
    {layer.url && <TileLayer attribution={layer.attribution} url={layer.url} maxZoom={layer.maxZoom}/>}<Viewport records={records} extent={extent} onExtentChange={onExtentChange}/>
    {records.map((record) => { const points = positions(record); if (!points.length) return null; if (record.mode === 'area' && points.length >= 3) return <Polygon key={record.id} positions={points} pathOptions={{ color: record.style?.outlineColor ?? secondaryColor, fillColor: record.style?.color ?? primaryColor, fillOpacity: .2, weight: record.style?.outlineWidth ?? 2 }}><Tooltip sticky>{record.label}</Tooltip></Polygon>; if ((record.mode === 'line' || record.mode === 'route') && points.length >= 2) return <Polyline key={record.id} positions={points} pathOptions={{ color: record.style?.color ?? primaryColor, weight: record.style?.lineWidth ?? 3, dashArray: record.mode === 'route' ? '9 6' : undefined }}><Tooltip sticky>{record.label}</Tooltip></Polyline>; return <Marker key={record.id} position={points[0]} icon={markerIcon(record.style?.color ?? primaryColor, record.style?.outlineColor ?? secondaryColor)}><Tooltip direction="top" permanent>{record.label}</Tooltip></Marker> })}
  </MapContainer><div className="extent-frame"><span>EXPORT FRAME</span></div><p>Pan with one finger · pinch to zoom · this exact frame becomes the map page</p></div>
}
