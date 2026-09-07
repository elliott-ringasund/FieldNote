import { Capacitor } from '@capacitor/core'
import { ArrowDown, ArrowLeft, ArrowUp, CheckSquare, Download, Share2, Square } from 'lucide-react'
import { useState } from 'react'
import { defaultReportOptions, downloadComposedReport, REPORT_SECTION_LABELS, type ReportOptions, type ReportSectionId } from '../lib/reportComposer'
import type { FileAction } from '../lib/nativeShare'
import type { FieldRecord, Project, UserProfile, WeatherSnapshot } from '../types'

type Props = { project: Project; records: FieldRecord[]; profile: UserProfile; weather: WeatherSnapshot | null; weatherInOutputs: boolean; primaryColor: string; secondaryColor: string; onBack: () => void; onDone: (message: string) => void; onError: (message: string) => void }

export function ReportComposer({ project, records, profile, weather, weatherInOutputs, primaryColor, secondaryColor, onBack, onDone, onError }: Props) {
  const [options, setOptions] = useState<ReportOptions>(() => ({ ...defaultReportOptions(records), includeWeather: weatherInOutputs, primaryColor, secondaryColor }))
  const [format, setFormat] = useState<'pdf' | 'doc' | 'html'>('pdf')
  const [busy, setBusy] = useState<FileAction | null>(null)
  const update = <Key extends keyof ReportOptions>(key: Key, value: ReportOptions[Key]) => setOptions((current) => ({ ...current, [key]: value }))
  const all = options.recordIds.length === records.length
  const toggleRecord = (id: string) => update('recordIds', options.recordIds.includes(id) ? options.recordIds.filter((item) => item !== id) : [...options.recordIds, id])
  const toggleSection = (id: ReportSectionId) => update('sections', options.sections.includes(id) ? options.sections.filter((item) => item !== id) : [...options.sections, id])
  const move = (index: number, offset: number) => {
    const next = [...options.sections]
    const destination = index + offset
    if (destination < 0 || destination >= next.length) return
    ;[next[index], next[destination]] = [next[destination], next[index]]
    update('sections', next)
  }
  const run = async (action: FileAction) => {
    setBusy(action)
    try {
      await downloadComposedReport(project, records, format, action, options, profile, weather)
      onDone(Capacitor.isNativePlatform() ? (action === 'save' ? 'Saved report to Documents / FieldNote.' : 'Report sharing completed.') : 'Report delivery requested. Check your sharing service or browser downloads.')
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'The report could not be created.') }
    finally { setBusy(null) }
  }
  const toggles: Array<[keyof ReportOptions, string, string]> = [
    ['includeAuthor', 'Author & business', 'Uses your profile details'], ['includeGeometry', 'Geometry summary', 'Type, count and measurement'], ['includeAttributes', 'Custom attributes', 'Every captured or imported field'], ['includeCoordinates', 'Coordinates', 'First WGS 84 position'], ['includeAccuracy', 'GPS accuracy', 'Device estimate where available'], ['includePhotos', 'Observation photos', 'Images and their captions'], ['includeComments', 'Comments', 'Field notes per observation'], ['includeTimestamps', 'Dates & times', 'Collection timestamps'], ['includeWeather', 'Weather', 'Latest field weather snapshot'],
  ]
  return <>
    <div className="sheet-heading"><div className="composer-heading"><button type="button" className="icon-button" onClick={onBack}><ArrowLeft /></button><div><p className="eyebrow">Modular report</p><h2>Build field report</h2></div></div></div>
    <div className="report-composer-scroll">
      <label className="field-label"><span>File type</span><select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="pdf">PDF document</option><option value="doc">Word-compatible DOC</option><option value="html">Interactive HTML</option></select><small>Interactive HTML links the map and observations with click, hover, search and geometry filters.</small></label>
      <fieldset className="composer-group output-scheme"><legend>Report colour scheme</legend><div className="two-fields"><label><input type="color" value={options.primaryColor} onChange={(event) => update('primaryColor', event.target.value)}/><span><strong>Primary</strong><small>Accents and status framing</small></span></label><label><input type="color" value={options.secondaryColor} onChange={(event) => update('secondaryColor', event.target.value)}/><span><strong>Secondary</strong><small>Headers and cover</small></span></label></div></fieldset>
      <fieldset className="composer-group"><legend>Observations ({options.recordIds.length}/{records.length})</legend><button type="button" className="select-all-row" onClick={() => update('recordIds', all ? [] : records.map((record) => record.id))}>{all ? <CheckSquare /> : <Square />}<span><strong>{all ? 'Clear all' : 'Include all'}</strong><small>Choose exactly which observations appear</small></span></button><div className="composer-records">{records.map((record, index) => <label key={record.id}><input type="checkbox" checked={options.recordIds.includes(record.id)} onChange={() => toggleRecord(record.id)} /><span><b>{index + 1}</b><span><strong>{record.label}</strong><small>{record.category} · {record.mode}</small></span></span></label>)}</div></fieldset>
      <fieldset className="composer-group"><legend>Included information</legend><div className="composer-toggles">{toggles.map(([key, label, hint]) => <label className="toggle-row" key={key}><input type="checkbox" checked={Boolean(options[key])} onChange={(event) => update(key, event.target.checked as never)} /><span><strong>{label}</strong><small>{hint}</small></span></label>)}</div></fieldset>
      <fieldset className="composer-group"><legend>Sections & order</legend><p className="group-help">Enable modules, then move them into the order you want.</p><div className="section-order">{(Object.keys(REPORT_SECTION_LABELS) as ReportSectionId[]).map((id) => { const enabled = options.sections.includes(id); const index = options.sections.indexOf(id); return <div className={enabled ? 'enabled' : ''} key={id}><label><input type="checkbox" checked={enabled} onChange={() => toggleSection(id)} /><span>{REPORT_SECTION_LABELS[id]}</span></label>{enabled && <span><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move section up"><ArrowUp /></button><button type="button" disabled={index === options.sections.length - 1} onClick={() => move(index, 1)} aria-label="Move section down"><ArrowDown /></button></span>}</div>})}</div></fieldset>
    </div>
    <div className="sheet-actions dual-delivery"><button type="button" className="secondary-button" disabled={Boolean(busy) || !options.recordIds.length} onClick={() => run('share')}><Share2 /> {busy === 'share' ? 'Preparing…' : 'Share'}</button><button type="button" className="primary-button" disabled={Boolean(busy) || !options.recordIds.length} onClick={() => run('save')}><Download /> {busy === 'save' ? 'Saving…' : 'Save to device'}</button></div>
  </>
}
