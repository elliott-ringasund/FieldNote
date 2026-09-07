import { AlertTriangle, Camera, Check, ChevronDown, ImagePlus, MapPin, X } from 'lucide-react'
import { useMemo, useState, type ChangeEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { geometryIssue } from '../lib/insights'
import { accuracyStats, formatAccuracy } from '../lib/accuracy'
import { formatArea, formatDistance, lineLengthMetres, polygonAreaSquareMetres } from '../lib/geo'
import { CATEGORY_PRESETS, MODE_LABELS, type Attachment, type CaptureDraft, type Coordinate, type FieldRecord, type RecordStatus } from '../types'

type Props = {
  draft: CaptureDraft
  projectId: string
  layerId?: string
  layerName?: string
  featureCode?: string
  suggestedLabel?: string
  currentPosition: Coordinate | null
  operative: string
  onCancel: () => void
  onSave: (record: FieldRecord) => void | Promise<void>
}

async function filesToAttachments(files: FileList, source: Attachment['source'], coordinate?: Coordinate): Promise<Attachment[]> {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<Attachment>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(reader.error)
          reader.onload = () => resolve({
            id: crypto.randomUUID(),
            name: file.name,
            dataUrl: String(reader.result),
            caption: '',
            capturedAt: new Date().toISOString(),
            source,
            coordinate,
          })
          reader.readAsDataURL(file)
        }),
    ),
  )
}

export function RecordForm({ draft, projectId, layerId, layerName, featureCode, suggestedLabel, currentPosition, operative, onCancel, onSave }: Props) {
  const deviceAccuracy = accuracyStats(draft.coordinates)
  const categoryOptions = [...new Set([layerName, ...CATEGORY_PRESETS[draft.mode]].filter((item): item is string => Boolean(item)))]
  const [category, setCategory] = useState(layerName || CATEGORY_PRESETS[draft.mode][0])
  const [label, setLabel] = useState(suggestedLabel ?? '')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<RecordStatus>(deviceAccuracy && deviceAccuracy.maximum > 10 ? 'needs-review' : 'complete')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [condition, setCondition] = useState('')
  const [priority, setPriority] = useState('')
  const [customFields, setCustomFields] = useState<Array<{ name: string; value: string }>>([])
  const [submitted, setSubmitted] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const nativePlatform = Capacitor.isNativePlatform()

  const measurement = useMemo(() => {
    if (draft.mode === 'area') return formatArea(polygonAreaSquareMetres(draft.coordinates))
    if (draft.mode === 'line' || draft.mode === 'route') return formatDistance(lineLengthMetres(draft.coordinates))
    return null
  }, [draft])

  const manualOnly = draft.coordinates.every((coordinate) => coordinate.source === 'manual')

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>, source: Attachment['source']) => {
    if (!event.target.files?.length) return
    const geotag = source === 'camera' && currentPosition?.source === 'device' && Date.now() - currentPosition.timestamp < 30_000 ? currentPosition : undefined
    try {
      const nextAttachments = await filesToAttachments(event.target.files, source, geotag)
      setAttachments((current) => [...current, ...nextAttachments])
    } catch { setPhotoError('Could not read the selected image. Try another file.') }
    event.target.value = ''
  }

  const addNativePhoto = async (source: CameraSource) => {
    setPhotoError('')
    try {
      const photo = await NativeCamera.getPhoto({ source, resultType: CameraResultType.DataUrl, quality: 82, correctOrientation: true, allowEditing: false })
      if (!photo.dataUrl) throw new Error('The selected image could not be read.')
      setAttachments((current) => [...current, {
        id: crypto.randomUUID(),
        name: `field-photo-${Date.now()}.${photo.format}`,
        dataUrl: photo.dataUrl!,
        caption: '',
        capturedAt: new Date().toISOString(),
        source: source === CameraSource.Camera ? 'camera' : 'library',
        coordinate: source === CameraSource.Camera && currentPosition?.source === 'device' && Date.now() - currentPosition.timestamp < 30_000 ? currentPosition : undefined,
      }])
    } catch (error) {
      if (!String(error).toLowerCase().includes('cancel')) setPhotoError(error instanceof Error ? error.message : 'The image could not be added.')
    }
  }

  const submit = async () => {
    if (saving) return
    setSaveError('')
    setSubmitted(true)
    if (!label.trim()) return
    const issue = geometryIssue(draft.mode, draft.coordinates)
    if (issue) { setSaveError(issue); return }
    const names = customFields.map(field => field.name.trim().toLowerCase())
    if (names.some(name => !name || ['condition', 'priority', 'feature code'].includes(name)) || new Set(names).size !== names.length) { setSaveError('Give each custom field a unique name, different from Condition, Priority and Feature code.'); return }
    const timestamp = new Date().toISOString()
    setSaving(true)
    try { await onSave({
      id: crypto.randomUUID(),
      projectId,
      layerId,
      mode: draft.mode,
      category,
      label: label.trim(),
      notes: notes.trim(),
      status,
      coordinates: draft.coordinates,
      attachments,
      operative,
      createdAt: draft.startedAt,
      updatedAt: timestamp,
      syncStatus: 'local',
      attributes: { ...(featureCode ? { 'Feature code': featureCode } : {}), ...(condition ? { Condition: condition } : {}), ...(priority ? { Priority: priority } : {}), ...Object.fromEntries(customFields.map(field => [field.name.trim(), field.value.trim()])) },
    }) } catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save. Your form is still here; try again.') } finally { setSaving(false) }
  }

  return (
    <div className="sheet-backdrop solid" role="presentation">
      <section className="bottom-sheet record-sheet" role="dialog" aria-modal="true" aria-labelledby="record-heading">
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">{MODE_LABELS[draft.mode]} captured</p>
            <h2 id="record-heading">Save observation</h2>
          </div>
          <button className="icon-button" type="button" disabled={saving} onClick={onCancel} aria-label="Discard record"><X size={21} /></button>
        </div>

        <div className="capture-summary">
          {layerName && <span>Layer · {layerName}</span>}
          <span><MapPin size={16} /> {draft.coordinates.length} {draft.coordinates.length === 1 ? 'position' : 'positions'}</span>
          {measurement && <span>{measurement}</span>}
          {deviceAccuracy && <span>{formatAccuracy(deviceAccuracy.maximum)} worst captured</span>}
          {manualOnly && <span>Manual placement · no accuracy estimate</span>}
        </div>
        {deviceAccuracy && deviceAccuracy.maximum > 10 && <div className="import-alert warning accuracy-warning"><AlertTriangle size={18} /><span><strong>Outside the 10 m review threshold</strong><small>The device reported {formatAccuracy(deviceAccuracy.maximum)} for the least accurate captured position. This record is marked for review automatically.</small></span></div>}

        <div className="form-scroll">
          <label className={`field-label ${submitted && !label.trim() ? 'field-error' : ''}`}>
            <span>Label <b>Required</b></span>
            <input autoFocus={!suggestedLabel} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. MH-001" />
            {submitted && !label.trim() && <small>Add a short label before saving.</small>}
          </label>

          <label className="field-label">
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condition, measurements, access details or work required…" rows={2} />
          </label>

          <div className="field-label">
            <span>Photos <small>Optional</small></span>
            <div className="image-grid">
              {attachments.map((attachment) => (
                <div className="image-preview" key={attachment.id}>
                  <img src={attachment.dataUrl} alt="Field attachment preview" />
                  <input aria-label="Photo caption" placeholder="Photo caption" value={attachment.caption} onChange={event => setAttachments(items => items.map(item => item.id === attachment.id ? { ...item, caption: event.target.value } : item))}/>
                  <button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))} aria-label="Remove image"><X size={15} /></button>
                </div>
              ))}
              {nativePlatform ? <>
                <button type="button" className="image-add camera-add" onClick={() => addNativePhoto(CameraSource.Camera)}><Camera size={22} /><span>Take photo</span></button>
                <button type="button" className="image-add" onClick={() => addNativePhoto(CameraSource.Photos)}><ImagePlus size={22} /><span>Choose image</span></button>
              </> : <>
                <label className="image-add camera-add"><Camera size={22} /><span>Take photo</span><input type="file" accept="image/*" capture="environment" onChange={(event) => handleFiles(event, 'camera')} /></label>
                <label className="image-add"><ImagePlus size={22} /><span>Choose image</span><input type="file" accept="image/*" multiple onChange={(event) => handleFiles(event, 'library')} /></label>
              </>}
            </div>
            <small className="geotag-note"><MapPin size={13} /> Camera photos use a recent phone position when available. Library images keep their added time and receive no assumed location.</small>
            {photoError && <small className="photo-error">{photoError}</small>}
          </div>
          <details className="observation-fields record-options"><summary>Record options <small>{category} · {status === 'complete' ? 'Complete' : status === 'needs-review' ? 'Needs review' : 'Follow-up'}</small></summary>
          <label className="field-label">
            <span>Type</span>
            <span className="select-wrap">
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categoryOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown size={18} />
            </span>
          </label>

          <fieldset className="status-field">
            <legend>Status</legend>
            <div className="segmented">
              {(['complete', 'needs-review', 'follow-up'] as RecordStatus[]).map((item) => (
                <button key={item} type="button" className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>
                  {item === 'complete' ? 'Complete' : item === 'needs-review' ? 'Review' : 'Follow-up'}
                </button>
              ))}
            </div>
          </fieldset>

          </details>
          <details className="observation-fields"><summary>Condition, priority & extra fields</summary>
            <div className="two-fields"><label className="field-label"><span>Condition</span><select value={condition} onChange={event => setCondition(event.target.value)}><option value="">Not assessed</option><option>Good</option><option>Fair</option><option>Poor</option><option>Failed</option></select></label><label className="field-label"><span>Priority</span><select value={priority} onChange={event => setPriority(event.target.value)}><option value="">Not assigned</option><option>Routine</option><option>Soon</option><option>Urgent</option></select></label></div>
            <p className="field-help">Add measured dimensions with units, material, asset ID or work required. These fields travel with the export.</p>
            {customFields.map((field, index) => <div className="custom-field-row" key={index}><input aria-label={`Field ${index + 1} name`} placeholder="e.g. Diameter (mm)" value={field.name} onChange={event => setCustomFields(fields => fields.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}/><input aria-label={`Field ${index + 1} value`} placeholder="Value" value={field.value} onChange={event => setCustomFields(fields => fields.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}/><button type="button" className="icon-button" aria-label={`Remove field ${index + 1}`} onClick={() => setCustomFields(fields => fields.filter((_, i) => i !== index))}><X size={16}/></button></div>)}
            <button type="button" className="secondary-button" onClick={() => setCustomFields(fields => [...fields, { name: '', value: '' }])}>+ Add field</button>
          </details>
        </div>

        {saveError && <p role="alert" className="photo-error">{saveError}</p>}
        <div className="sheet-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>Discard</button>
          <button type="button" className="primary-button" disabled={saving} onClick={submit}><Check size={19} /> {saving ? 'Saving…' : 'Save record'}</button>
        </div>
      </section>
    </div>
  )
}
