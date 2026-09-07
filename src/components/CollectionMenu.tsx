import { CircleDot, Edit3, Layers3, Pentagon, Plus, Route, Spline, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createCollectionDefinition, suggestCollectionCode } from '../lib/collectionLibrary'
import type { CollectionDefinition, CollectionMode, ProjectLayer, RecordStyle } from '../types'

type Props = {
  open: boolean
  layers: ProjectLayer[]
  definitions: CollectionDefinition[]
  activeLayerId?: string
  onClose: () => void
  onCollectLayer: (layer: ProjectLayer) => void
  onCollectDefinition: (definition: CollectionDefinition) => void
  onSaveAndCollect: (definition: CollectionDefinition) => void
  onRemoveDefinition: (definition: CollectionDefinition) => void
}

const geometries: Array<{ mode: CollectionMode; label: string; icon: typeof CircleDot }> = [
  { mode: 'point', label: 'Point', icon: CircleDot },
  { mode: 'line', label: 'Line', icon: Spline },
  { mode: 'area', label: 'Area', icon: Pentagon },
  { mode: 'route', label: 'Route', icon: Route },
]

type DefinitionDraft = {
  id?: string
  name: string
  code: string
  geometryType: CollectionMode
  group: string
  style?: RecordStyle
  createdAt?: string
}

const emptyDraft = (): DefinitionDraft => ({ name: '', code: '', geometryType: 'point', group: 'Field data' })

export function CollectionMenu({ open, ...props }: Props) {
  if (!open) return null
  return <OpenCollectionMenu {...props}/>
}

function OpenCollectionMenu({ layers, definitions, activeLayerId, onClose, onCollectLayer, onCollectDefinition, onSaveAndCollect, onRemoveDefinition }: Omit<Props, 'open'>) {
  const [editing, setEditing] = useState(layers.length === 0 && definitions.length === 0)
  const [advanced, setAdvanced] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<DefinitionDraft>(emptyDraft)

  const filteredLayers = useMemo(() => {
    const search = query.trim().toLowerCase()
    return layers.filter((layer) => !search || `${layer.name} ${layer.code ?? ''} ${layer.group}`.toLowerCase().includes(search))
  }, [layers, query])
  const filteredDefinitions = useMemo(() => {
    const search = query.trim().toLowerCase()
    return definitions.filter((definition) => !search || `${definition.name} ${definition.code} ${definition.group}`.toLowerCase().includes(search))
  }, [definitions, query])

  const editDefinition = (definition: CollectionDefinition) => {
    setDraft({ ...definition, style: { ...definition.style } })
    setAdvanced(true)
    setEditing(true)
  }

  const save = () => {
    if (!draft.name.trim()) return
    onSaveAndCollect(createCollectionDefinition({ ...draft, id: draft.id, createdAt: draft.createdAt }, definitions.length))
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="bottom-sheet collection-sheet live-collection-sheet" role="dialog" aria-modal="true" aria-labelledby="collection-heading">
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div><p className="eyebrow">Live data collection</p><h2 id="collection-heading">{editing ? (draft.id ? 'Edit collection type' : 'Create a collection type') : 'Choose what to collect'}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close collection menu"><X size={21} /></button>
        </div>

        {!editing ? <>
          <div className="collection-search-row">
            <label><Layers3 size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search layers or codes"/></label>
            <button type="button" onClick={() => { setDraft(emptyDraft()); setEditing(true) }}><Plus size={17}/> New</button>
          </div>
          <div className="collection-library-scroll">
            {filteredLayers.length > 0 && <section className="collection-section">
              <header><span>THIS PROJECT</span><small>Tap a type to start</small></header>
              <div className="collection-layer-list">
                {filteredLayers.map((layer) => {
                  const Icon = geometries.find((item) => item.mode === layer.geometryType)?.icon ?? CircleDot
                  return <button type="button" className={layer.id === activeLayerId ? 'active' : ''} key={layer.id} disabled={layer.locked} onClick={() => onCollectLayer(layer)}>
                    <span className="collection-layer-icon" style={{ color: layer.style.color }}><Icon size={19}/></span>
                    <span><strong>{layer.name}</strong><small>{layer.code || suggestCollectionCode(layer.name)} · {layer.geometryType}</small></span>
                    <b>{layer.locked ? 'Locked' : layer.id === activeLayerId ? 'Current' : 'Collect'}</b>
                  </button>
                })}
              </div>
            </section>}
            {filteredDefinitions.length > 0 && <section className="collection-section remembered">
              <header><span>REMEMBERED LIBRARY</span><small>Reusable in this job or the next one</small></header>
              <div className="collection-layer-list">
                {filteredDefinitions.map((definition) => {
                  const Icon = geometries.find((item) => item.mode === definition.geometryType)?.icon ?? CircleDot
                  return <div className="remembered-definition" key={definition.id}>
                    <button type="button" className="definition-main" onClick={() => onCollectDefinition(definition)}>
                      <span className="collection-layer-icon" style={{ color: definition.style.color }}><Icon size={19}/></span>
                      <span><strong>{definition.name}</strong><small>{definition.code} · {definition.geometryType}</small></span><b>Use</b>
                    </button>
                    <button type="button" onClick={() => editDefinition(definition)} aria-label={`Edit ${definition.name}`}><Edit3 size={15}/></button>
                    <button type="button" onClick={() => onRemoveDefinition(definition)} aria-label={`Forget ${definition.name}`}><Trash2 size={15}/></button>
                  </div>
                })}
              </div>
            </section>}
            {!filteredLayers.length && !filteredDefinitions.length && <div className="collection-empty"><Layers3 size={28}/><strong>No collection types yet</strong><small>Create one here while you work. FieldNote will remember it for next time.</small></div>}
          </div>
          <p className="privacy-note">Choose a layer to start immediately, or define a new type without leaving the map.</p>
        </> : <div className="collection-definition-form">
          <label className="field-label"><span>Layer / feature type <b>Required</b></span><input autoFocus value={draft.name} onChange={(event) => {
            const name = event.target.value
            const previousSuggestion = suggestCollectionCode(draft.name)
            setDraft((current) => ({ ...current, name, code: !current.code || current.code === previousSuggestion ? suggestCollectionCode(name) : current.code }))
          }} placeholder="e.g. Manhole"/></label>
          <fieldset className="collection-geometry-field"><legend>Geometry</legend><div>{geometries.map(({ mode, label, icon: Icon }) => <button type="button" className={draft.geometryType === mode ? 'active' : ''} key={mode} onClick={() => setDraft((current) => ({ ...current, geometryType: mode }))}><Icon size={19}/><span>{label}</span></button>)}</div></fieldset>
          <button type="button" className="collection-advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span>{advanced ? '−' : '+'} Advanced details</span><small>Code, group, colour and symbol</small></button>
          {advanced && <div className="collection-advanced-grid">
            <label className="field-label"><span>Feature code</span><input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Automatic"/></label>
            <label className="field-label"><span>Layer group</span><input value={draft.group} onChange={(event) => setDraft((current) => ({ ...current, group: event.target.value }))} placeholder="Field data"/></label>
            <label className="field-label collection-colour"><span>Colour</span><input type="color" value={draft.style?.color ?? '#31c4d6'} onChange={(event) => setDraft((current) => ({ ...current, style: { ...current.style, color: event.target.value } }))}/></label>
            {draft.geometryType === 'point' && <label className="field-label"><span>Point symbol</span><select value={draft.style?.symbol ?? 'circle'} onChange={(event) => setDraft((current) => ({ ...current, style: { ...current.style, symbol: event.target.value as RecordStyle['symbol'] } }))}><option value="circle">Circle</option><option value="pin">Pin</option><option value="square">Square</option><option value="triangle">Triangle</option></select></label>}
          </div>}
          <div className="sheet-actions collection-definition-actions"><button type="button" className="secondary-button" onClick={() => layers.length || definitions.length ? setEditing(false) : onClose()}>Back</button><button type="button" className="primary-button" disabled={!draft.name.trim()} onClick={save}><Plus size={18}/> Save & collect</button></div>
          <p className="privacy-note">This creates the layer now and remembers the definition for future jobs. You can edit or forget it later without deleting collected features.</p>
        </div>}
      </section>
    </div>
  )
}
