import { Check, Plus, TableProperties, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { FieldRecord, ProjectLayer, RecordStatus } from '../types'

type AttributeRow = { id: string; key: string; value: string }
type Props = { record: FieldRecord; layers: ProjectLayer[]; onClose: () => void; onSave: (record: FieldRecord) => void }

export function FeatureEditorSheet({ record, layers, onClose, onSave }: Props) {
  const [label, setLabel] = useState(record.label)
  const [category, setCategory] = useState(record.category)
  const [notes, setNotes] = useState(record.notes)
  const [status, setStatus] = useState<RecordStatus>(record.status)
  const [layerId, setLayerId] = useState(record.layerId ?? '')
  const [attributes, setAttributes] = useState<AttributeRow[]>(Object.entries(record.attributes ?? {}).map(([key, value]) => ({ id: crypto.randomUUID(), key, value: value === null ? '' : String(value) })))
  const compatibleLayers = layers.filter((layer) => layer.geometryType === record.mode)

  const save = () => {
    if (!label.trim()) return
    const nextAttributes = Object.fromEntries(attributes.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]))
    onSave({ ...record, label: label.trim(), category: category.trim() || 'Uncategorised', notes: notes.trim(), status, layerId: layerId || record.layerId, attributes: nextAttributes, updatedAt: new Date().toISOString(), syncStatus: 'local' })
  }

  return <div className="sheet-backdrop solid"><section className="bottom-sheet feature-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="feature-editor-heading">
    <div className="sheet-handle"/>
    <div className="sheet-heading"><div><p className="eyebrow">Feature attributes</p><h2 id="feature-editor-heading">Edit {record.label}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={21}/></button></div>
    <div className="feature-layer-target"><TableProperties size={18}/><span><small>Layer</small><select value={layerId} onChange={(event) => setLayerId(event.target.value)}>{compatibleLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.group} / {layer.name}</option>)}</select></span></div>
    <div className="form-scroll">
      <div className="two-fields"><label className="field-label"><span>Label</span><input value={label} onChange={(event) => setLabel(event.target.value)}/></label><label className="field-label"><span>Category</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Feature type"/></label></div>
      <label className="field-label"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as RecordStatus)}><option value="complete">Complete</option><option value="needs-review">Needs review</option><option value="follow-up">Follow-up</option></select></label>
      <label className="field-label"><span>Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4}/></label>
      <section className="custom-attributes"><div><span><strong>Custom attributes</strong><small>Project-specific fields for this feature</small></span><button type="button" onClick={() => setAttributes((rows) => [...rows, { id: crypto.randomUUID(), key: '', value: '' }])}><Plus size={15}/> Field</button></div>
        {attributes.length === 0 && <p>No custom fields yet. Add only the information this job needs.</p>}
        {attributes.map((row) => <div className="attribute-row" key={row.id}><input aria-label="Attribute name" value={row.key} onChange={(event) => setAttributes((rows) => rows.map((item) => item.id === row.id ? { ...item, key: event.target.value } : item))} placeholder="Field name"/><input aria-label="Attribute value" value={row.value} onChange={(event) => setAttributes((rows) => rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} placeholder="Value"/><button type="button" onClick={() => setAttributes((rows) => rows.filter((item) => item.id !== row.id))} aria-label="Remove attribute"><Trash2 size={15}/></button></div>)}
      </section>
    </div>
    <div className="sheet-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" onClick={save} disabled={!label.trim()}><Check size={19}/> Save attributes</button></div>
  </section></div>
}
