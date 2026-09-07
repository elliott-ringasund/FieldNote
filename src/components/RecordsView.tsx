import { ChevronRight, Download, EyeOff, FileUp, ImageOff, Layers3, MapPin, Move, Palette, Pentagon, Route, Search, TableProperties, Trash2, Waypoints } from 'lucide-react'
import { JobInsights, RecordInsights } from './JobInsights'
import { recordIssues } from '../lib/insights'
import { useMemo, useState } from 'react'
import { formatArea, formatDistance, lineLengthMetres, polygonAreaSquareMetres } from '../lib/geo'
import { accuracyStats, formatAccuracy } from '../lib/accuracy'
import { MODE_LABELS, type CollectionMode, type FieldRecord, type Project, type ProjectLayer } from '../types'

const modeIcons: Record<CollectionMode, typeof MapPin> = { point: MapPin, line: Waypoints, area: Pentagon, route: Route }

type Props = { records: FieldRecord[]; layers: ProjectLayer[]; project: Project | undefined; onImportRequested: () => void; onExportRequested: () => void; onEditRecord: (record: FieldRecord) => void; onEditAttributes: (record: FieldRecord) => void; onDeleteRecord: (record: FieldRecord) => void; onDeleteAttachment: (record: FieldRecord, attachmentId: string) => void; onStyleRecord: (record: FieldRecord) => void }

function measurement(record: FieldRecord) {
  if (record.mode === 'area') return formatArea(polygonAreaSquareMetres(record.coordinates))
  if (record.mode === 'line' || record.mode === 'route') return formatDistance(lineLengthMetres(record.coordinates))
  const accuracy = accuracyStats(record.coordinates)
  if (accuracy) return formatAccuracy(accuracy.maximum)
  return record.source === 'import' ? 'Imported' : 'Manual'
}

export function RecordsView({ records, layers, project, onImportRequested, onExportRequested, onEditRecord, onEditAttributes, onDeleteRecord, onDeleteAttachment, onStyleRecord }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention'>('all')
  const [layerFilter, setLayerFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const visible = useMemo(() => records.filter((record) => `${record.label} ${record.category} ${record.notes} ${Object.entries(record.attributes ?? {}).flat().join(' ')}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || recordIssues(record).length > 0) && (layerFilter === 'all' || record.layerId === layerFilter)), [records, query, filter, layerFilter])
  const layerSections = useMemo(() => {
    const relevantLayers = layerFilter === 'all' ? layers : layers.filter((layer) => layer.id === layerFilter)
    const sections = relevantLayers.map((layer) => ({ layer, records: visible.filter((record) => record.layerId === layer.id) })).filter((section) => section.records.length > 0)
    const unassigned = visible.filter((record) => !layers.some((layer) => layer.id === record.layerId))
    return unassigned.length ? [...sections, { layer: undefined, records: unassigned }] : sections
  }, [layerFilter, layers, visible])

  return (
    <main className="page records-page">
      <div className="page-title-row"><div><p className="eyebrow">{project?.code ?? 'Project'}</p><h1>Job records</h1><p>{project?.name ?? 'Select a project'} · review, measure and share</p></div><div className="page-actions"><button type="button" className="secondary-button" disabled={!project} onClick={onImportRequested}><FileUp size={18} /> Import</button><button type="button" className="secondary-button export-button" disabled={!project || records.length === 0} onClick={onExportRequested}><Download size={18} /> Export</button></div></div>
      <JobInsights records={records} onReview={() => { setFilter('attention'); setQuery(''); setLayerFilter('all') }}/><div className="record-tools">
        <label className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search labels, attributes or notes" /></label>
        <div className="filter-pills"><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{records.length}</span></button><button type="button" className={filter === 'attention' ? 'active' : ''} onClick={() => setFilter('attention')}>Needs attention <span>{records.filter((record) => recordIssues(record).length > 0).length}</span></button></div>
      </div>
      <details className="filter-section"><summary>Filter by layer <small>{layerFilter === 'all' ? 'All layers' : layers.find(layer => layer.id === layerFilter)?.name}</small></summary><div className="feature-layer-filters" aria-label="Filter features by layer"><button type="button" className={layerFilter === 'all' ? 'active' : ''} onClick={() => setLayerFilter('all')}><Layers3 size={14}/> All layers <span>{records.length}</span></button>{layers.map((layer) => <button type="button" key={layer.id} className={layerFilter === layer.id ? 'active' : ''} onClick={() => setLayerFilter(layer.id)}><i style={{ background: layer.style.color ?? '#31c4d6' }}/>{layer.name}{!layer.visible && <EyeOff size={12}/>}<span>{records.filter((record) => record.layerId === layer.id).length}</span></button>)}</div>
      </details><section className="record-list" aria-live="polite">
        {visible.length === 0 && <div className="empty-state"><Search size={28} /><h2>No matching records</h2><p>Try a different search or filter.</p></div>}
        {layerSections.map((section) => <section className="feature-layer-section" key={section.layer?.id ?? 'unassigned'}><header><span className="feature-layer-symbol" style={{ color: section.layer?.style.color ?? '#777' }}><Layers3 size={15}/></span><span><small>{section.layer?.group ?? 'Project data'}</small><strong>{section.layer?.name ?? 'Unassigned features'}</strong></span><b>{section.records.length}</b></header>{section.records.map((record) => {
          const Icon = modeIcons[record.mode]
          const isExpanded = expanded === record.id
          return (
            <article className={`record-card ${isExpanded ? 'expanded' : ''}`} key={record.id}>
              <button type="button" className="record-card-summary" onClick={() => setExpanded(isExpanded ? null : record.id)}>
                <span className={`record-mode mode-${record.mode}`}><Icon size={19} /></span>
                <span className="record-main"><small>{record.category} · {MODE_LABELS[record.mode]}</small><strong>{record.label}</strong><span>{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(record.createdAt))}</span></span>
                <span className="record-measure"><strong>{measurement(record)}</strong><small className={`status-${record.status}`}>{record.status === 'complete' ? 'Complete' : record.status === 'needs-review' ? 'Needs review' : 'Follow-up'}</small></span><ChevronRight size={19} className="record-chevron" />
              </button>
              {isExpanded && <div className="record-detail"><RecordInsights record={record}/><p>{record.notes || 'No notes were added.'}</p><dl><div><dt>Operative</dt><dd>{record.operative}</dd></div><div><dt>Positions</dt><dd>{record.coordinates.length}</dd></div><div><dt>Storage</dt><dd>{record.syncStatus === 'local' ? 'Saved on device' : 'Synced'}</dd></div>{Object.entries(record.attributes ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value ?? '')}</dd></div>)}</dl><div className="record-action-row"><button type="button" className="record-edit-button primary-edit" onClick={() => onEditAttributes(record)}><TableProperties size={16}/> Attributes</button><button type="button" className="record-edit-button" onClick={() => onEditRecord(record)}><Move size={16} /> Geometry</button><button type="button" className="record-edit-button" onClick={() => onStyleRecord(record)}><Palette size={16} /> Override</button><button type="button" className="record-edit-button danger" onClick={() => onDeleteRecord(record)}><Trash2 size={16} /> Delete</button></div>{record.attachments.length > 0 && <div className="record-images">{record.attachments.map((attachment) => <figure key={attachment.id}><img src={attachment.dataUrl} alt={attachment.caption || attachment.name} /><button type="button" onClick={() => onDeleteAttachment(record, attachment.id)} aria-label={`Remove ${attachment.name}`}><ImageOff size={14} /></button></figure>)}</div>}</div>}
            </article>
          )
        })}</section>)}
      </section>
    </main>
  )
}
