import { Check, ChevronDown, ChevronUp, CircleDot, Eye, EyeOff, FolderTree, Layers3, Lock, Map as MapIcon, Pentagon, Plus, Route, Save, Spline, Trash2, Unlock, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BASEMAPS, type BasemapId } from '../lib/basemaps'
import type { CollectionMode, FieldRecord, ProjectLayer } from '../types'

type Props = {
  layers: ProjectLayer[]
  records: FieldRecord[]
  activeLayerId?: string
  basemap: BasemapId
  onClose: () => void
  onSetActive: (layerId: string) => void
  onUpdate: (layer: ProjectLayer) => void
  onAdd: (name: string, geometryType: CollectionMode, group: string) => void
  onDelete: (layerId: string) => void
  onMove: (layerId: string, direction: -1 | 1) => void
  onBasemap: (basemap: BasemapId) => void
}

const GEOMETRY_LABELS: Record<CollectionMode, string> = { point: 'Point', line: 'Line', area: 'Area', route: 'Route' }

function GeometryIcon({ mode, size = 16 }: { mode: CollectionMode; size?: number }) {
  if (mode === 'point') return <CircleDot size={size}/>
  if (mode === 'area') return <Pentagon size={size}/>
  if (mode === 'route') return <Route size={size}/>
  return <Spline size={size}/>
}

export function LayerPanel({ layers, records, activeLayerId, basemap, onClose, onSetActive, onUpdate, onAdd, onDelete, onMove, onBasemap }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('Field data')
  const [geometryType, setGeometryType] = useState<CollectionMode>('point')
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0]
  const [editedLayer, setEditedLayer] = useState<ProjectLayer | null>(() => activeLayer ? { ...activeLayer, style: { ...activeLayer.style } } : null)

  const groups = useMemo(() => {
    const values = new Map<string, ProjectLayer[]>()
    layers.forEach((layer) => values.set(layer.group, [...(values.get(layer.group) ?? []), layer]))
    return [...values.entries()]
  }, [layers])
  const countFor = (layerId: string) => records.filter((record) => record.layerId === layerId).length

  const addLayer = () => {
    if (!name.trim()) return
    onAdd(name, geometryType, group)
    setName('')
    setAdding(false)
  }

  return <aside className="layer-panel" aria-label="Project layers">
    <header className="layer-panel-head">
      <div><small>PROJECT CONTENTS</small><strong><Layers3 size={18}/> Layers</strong><span>{layers.length} layers · {records.length} features</span></div>
      <button type="button" onClick={onClose} aria-label="Close layers"><X size={20}/></button>
    </header>

    <div className="layer-panel-scroll">
      <section className="layer-tree" aria-label="Layer tree">
        {groups.map(([groupName, groupLayers]) => <div className="layer-group" key={groupName}>
          <div className="layer-group-title"><ChevronDown size={15}/><FolderTree size={15}/><strong>{groupName}</strong><span>{groupLayers.length}</span></div>
          {groupLayers.map((layer) => {
            const active = layer.id === activeLayer?.id
            const count = countFor(layer.id)
            return <div className={`layer-row ${active ? 'active' : ''}`} key={layer.id}>
              <button type="button" className="layer-visibility" onClick={() => onUpdate({ ...layer, visible: !layer.visible })} aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}>{layer.visible ? <Eye size={17}/> : <EyeOff size={17}/>}</button>
              <button type="button" className="layer-main" onClick={() => onSetActive(layer.id)}>
                <span className={`layer-geometry mode-${layer.geometryType}`} style={{ color: layer.style.color }}><GeometryIcon mode={layer.geometryType}/></span>
                <span><strong>{layer.name}</strong><small>{layer.code ? `${layer.code} · ` : ''}{GEOMETRY_LABELS[layer.geometryType]} · {count} {count === 1 ? 'feature' : 'features'}</small></span>
                {active && <span className="active-layer-dot" title="Active layer"/>}
              </button>
              <button type="button" className="layer-lock" onClick={() => onUpdate({ ...layer, locked: !layer.locked })} aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}>{layer.locked ? <Lock size={15}/> : <Unlock size={15}/>}</button>
            </div>
          })}
        </div>)}
      </section>

      <button type="button" className="add-layer-button" onClick={() => setAdding((value) => !value)}><Plus size={17}/> New layer</button>
      {adding && <section className="new-layer-form">
        <label><span>Layer name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Drainage defects"/></label>
        <label><span>Group</span><input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="Field data"/></label>
        <label><span>Geometry</span><select value={geometryType} onChange={(event) => setGeometryType(event.target.value as CollectionMode)}>{Object.entries(GEOMETRY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div><button type="button" onClick={() => setAdding(false)}>Cancel</button><button type="button" className="primary" onClick={addLayer} disabled={!name.trim()}><Check size={15}/> Add</button></div>
      </section>}

      {editedLayer && <section className="layer-properties">
        <div className="layer-section-title"><span><small>ACTIVE LAYER</small><strong>Layer properties</strong></span><span className="layer-order-buttons"><button type="button" onClick={() => onMove(editedLayer.id, -1)} aria-label="Move layer up"><ChevronUp size={16}/></button><button type="button" onClick={() => onMove(editedLayer.id, 1)} aria-label="Move layer down"><ChevronDown size={16}/></button></span></div>
        <label><span>Name</span><input value={editedLayer.name} onChange={(event) => setEditedLayer({ ...editedLayer, name: event.target.value })}/></label>
        <label><span>Feature code</span><input value={editedLayer.code ?? ''} onChange={(event) => setEditedLayer({ ...editedLayer, code: event.target.value.toUpperCase() })} placeholder="e.g. MH"/></label>
        <label><span>Group</span><input value={editedLayer.group} onChange={(event) => setEditedLayer({ ...editedLayer, group: event.target.value })}/></label>
        <div className="layer-colours"><label><span>Colour</span><input type="color" value={editedLayer.style.color ?? '#31c4d6'} onChange={(event) => setEditedLayer({ ...editedLayer, style: { ...editedLayer.style, color: event.target.value } })}/></label><label><span>Outline</span><input type="color" value={editedLayer.style.outlineColor ?? '#ffffff'} onChange={(event) => setEditedLayer({ ...editedLayer, style: { ...editedLayer.style, outlineColor: event.target.value } })}/></label></div>
        {editedLayer.geometryType !== 'point' && <label><span>Line width · {editedLayer.style.lineWidth ?? 3}px</span><input type="range" min="1" max="10" value={editedLayer.style.lineWidth ?? 3} onChange={(event) => setEditedLayer({ ...editedLayer, style: { ...editedLayer.style, lineWidth: Number(event.target.value) } })}/></label>}
        <label className="layer-check"><input type="checkbox" checked={editedLayer.style.showLabel !== false} onChange={(event) => setEditedLayer({ ...editedLayer, style: { ...editedLayer.style, showLabel: event.target.checked } })}/><span>Show labels</span></label>
        <div className="layer-property-actions"><button type="button" className="danger" disabled={countFor(editedLayer.id) > 0} title={countFor(editedLayer.id) ? 'Move or delete this layer’s features first' : 'Delete empty layer'} onClick={() => onDelete(editedLayer.id)}><Trash2 size={16}/></button><button type="button" className="save" onClick={() => onUpdate({ ...editedLayer, name: editedLayer.name.trim() || 'Untitled layer', group: editedLayer.group.trim() || 'Field data' })}><Save size={16}/> Apply</button></div>
      </section>}

      <section className="basemap-layer-section">
        <div className="layer-section-title"><span><small>REFERENCE</small><strong><MapIcon size={16}/> Basemap</strong></span></div>
        {Object.values(BASEMAPS).map((item) => <button type="button" key={item.id} className={basemap === item.id ? 'active' : ''} onClick={() => onBasemap(item.id)}><span className={`basemap-preview ${item.previewClass}`}/><span><strong>{item.name}</strong><small>{item.description}</small></span>{basemap === item.id && <Check size={16}/>}</button>)}
      </section>
    </div>
    <footer><span className="active-layer-symbol" style={{ background: activeLayer?.style.color ?? '#31c4d6' }}/><span><small>New features go to</small><strong>{activeLayer?.name ?? 'No active layer'}{activeLayer?.code ? ` · ${activeLayer.code}` : ''}</strong></span></footer>
  </aside>
}
